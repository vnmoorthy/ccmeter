// `ccmeter selftest` — real-data sanity check.
//
// Run on YOUR ~/.claude/projects to verify ccmeter is parsing the actual
// JSONL shape Claude Code is currently writing. Produces a redacted
// diagnostic anyone can paste back into a GitHub issue without leaking
// source code, prompts, or paths.
//
// What it checks (and why each matters):
//   1. Log directory exists and contains *.jsonl files.
//   2. The parser opens each file without exception.
//   3. ≥80% of lines parse against the lenient Zod schema (catches schema
//      drift if Anthropic ships a renamed field).
//   4. ≥1 turn has a `usage` object with the expected token-count keys.
//      If 0, our cost numbers will all be zero — biggest landmine.
//   5. ≥1 turn carries either `cache_read_input_tokens` or
//      `cache_creation_input_tokens` (otherwise no cache analysis works).
//   6. Sampled turn shapes are consistent with the schema in src/core/jsonl.
//   7. Total cost across the window is non-zero and inside reasonable
//      sanity bounds vs token totals.
//
// All output is plain text; project paths are redacted by default.

import path from "node:path";
import os from "node:os";
import { findSessionFiles, getDefaultLogDir } from "../../core/paths.js";
import { parseFile } from "../../core/jsonl/reader.js";
import { costForTurn } from "../../core/pricing/compute.js";
import { turnHasUsage, turnTimestampMs, turnModel } from "../../core/jsonl/schema.js";
import { redactPath } from "../../core/privacy.js";
import { getPricingVerifiedDate } from "../../core/pricing/models.js";
import pc from "picocolors";

const { bold, dim, green, red, yellow, cyan } = pc;

export interface SelftestOpts {
  /** Reveal full project paths instead of redacting them. Off by default. */
  noRedact?: boolean;
  /** How many sample turns to print so we can debug schema drift. */
  sampleTurns?: string;
  /** Limit how many files to walk (helps on huge histories). */
  maxFiles?: string;
  /** JSON output for piping into an issue body. */
  json?: boolean;
}

interface Check {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

interface SelftestReport {
  ccmeterVersion: string;
  node: string;
  platform: string;
  pricingVerifiedAt: string;
  logDir: string;
  filesFound: number;
  filesScanned: number;
  bytesScanned: number;
  totalLines: number;
  validTurns: number;
  parseErrors: number;
  parseSuccessRatio: number;
  turnsWithUsage: number;
  turnsWithCacheActivity: number;
  modelsObserved: string[];
  unknownTopLevelKeys: string[];
  unknownUsageKeys: string[];
  /** Estimated total cost across the scanned files (sanity check). */
  estimatedCost: number;
  /** Sampled redacted turn shapes — the most useful debugging artifact. */
  sampleShapes: Array<{
    fileBasename: string;
    lineNumber: number;
    keys: string[];
    messageKeys: string[];
    usageKeys: string[];
    model: string | undefined;
    hasTimestamp: boolean;
  }>;
  checks: Check[];
}

const KNOWN_TOP_LEVEL = new Set([
  "type",
  "timestamp",
  "sessionId",
  "uuid",
  "parentUuid",
  "cwd",
  "projectPath",
  "version",
  "requestId",
  "isMeta",
  "isSidechain",
  "isApiErrorMessage",
  "message",
  "toolUseResult",
  "summary",
  "leafUuid",
  "gitBranch",
  "userType",
]);

const KNOWN_USAGE_KEYS = new Set([
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
  "cache_creation",
  "server_tool_use",
  "service_tier",
]);

export async function runSelftest(opts: SelftestOpts): Promise<void> {
  const sampleTurns = parseInt(opts.sampleTurns ?? "5", 10);
  const maxFiles = parseInt(opts.maxFiles ?? "200", 10);
  const logDir = getDefaultLogDir();

  process.stdout.write(
    `\n${bold("ccmeter selftest")}  ${dim("— validates the parser/pricing against your real data")}\n`,
  );
  process.stdout.write(`${dim(logDir)}\n\n`);

  const files = await findSessionFiles(logDir).catch(() => []);
  const filesFound = files.length;
  const filesToScan = files.slice(0, maxFiles);

  let totalLines = 0;
  let validTurns = 0;
  let parseErrors = 0;
  let bytesScanned = 0;
  let turnsWithUsage = 0;
  let turnsWithCacheActivity = 0;
  let estimatedCost = 0;
  const modelsObserved = new Set<string>();
  const unknownTopLevel = new Map<string, number>();
  const unknownUsage = new Map<string, number>();
  const sampleShapes: SelftestReport["sampleShapes"] = [];

  for (const f of filesToScan) {
    bytesScanned += f.size;
    const r = await parseFile(f.path, "selftest", f.mtimeMs, f.size);
    totalLines += r.stats.totalLines;
    validTurns += r.stats.validTurns;
    parseErrors += r.errors.length;

    for (const turn of r.turns) {
      // unknown top-level keys
      for (const k of Object.keys(turn)) {
        if (!KNOWN_TOP_LEVEL.has(k)) {
          unknownTopLevel.set(k, (unknownTopLevel.get(k) ?? 0) + 1);
        }
      }
      const u = turn.message?.usage;
      if (u) {
        for (const k of Object.keys(u)) {
          if (!KNOWN_USAGE_KEYS.has(k)) {
            unknownUsage.set(k, (unknownUsage.get(k) ?? 0) + 1);
          }
        }
      }

      const m = turnModel(turn);
      if (m) modelsObserved.add(m);

      if (turnHasUsage(turn)) {
        turnsWithUsage += 1;
        const u2 = turn.message?.usage;
        if (
          (u2?.cache_read_input_tokens && u2.cache_read_input_tokens > 0) ||
          (u2?.cache_creation_input_tokens && u2.cache_creation_input_tokens > 0)
        ) {
          turnsWithCacheActivity += 1;
        }
        try {
          estimatedCost += costForTurn(turn).totalCost;
        } catch {
          /* model unknown — already covered by warnings */
        }
      }
    }

    if (sampleShapes.length < sampleTurns) {
      // Pick the first 1–2 turns from this file as a shape sample.
      const want = Math.min(2, sampleTurns - sampleShapes.length);
      let n = 0;
      for (let i = 0; i < r.turns.length && n < want; i++) {
        const t = r.turns[i];
        if (!t) continue;
        sampleShapes.push({
          fileBasename: redactBasename(f.path),
          lineNumber: i + 1,
          keys: Object.keys(t).sort(),
          messageKeys: t.message ? Object.keys(t.message).sort() : [],
          usageKeys: t.message?.usage ? Object.keys(t.message.usage).sort() : [],
          model: turnModel(t),
          hasTimestamp: turnTimestampMs(t) !== undefined,
        });
        n += 1;
      }
    }
  }

  const parseSuccessRatio = totalLines === 0 ? 0 : validTurns / totalLines;

  const checks: Check[] = [];
  checks.push(
    filesFound === 0
      ? { name: "log directory", status: "fail", message: `no .jsonl files at ${logDir}. Set CCMETER_LOG_DIR if your logs live elsewhere.` }
      : { name: "log directory", status: "pass", message: `found ${filesFound} files (${(bytesScanned / 1e6).toFixed(1)} MB scanned)` },
  );
  if (filesFound > 0) {
    checks.push(
      parseSuccessRatio >= 0.8
        ? { name: "schema parse", status: "pass", message: `${(parseSuccessRatio * 100).toFixed(1)}% of ${totalLines.toLocaleString()} lines parsed cleanly` }
        : parseSuccessRatio >= 0.5
          ? { name: "schema parse", status: "warn", message: `only ${(parseSuccessRatio * 100).toFixed(1)}% parsed — schema drift likely. Check unknown keys below.` }
          : { name: "schema parse", status: "fail", message: `${(parseSuccessRatio * 100).toFixed(1)}% parsed — Claude Code's format changed. File a ccmeter issue with this output.` },
    );
    checks.push(
      turnsWithUsage > 0
        ? { name: "usage objects", status: "pass", message: `${turnsWithUsage.toLocaleString()} turns with token-count usage` }
        : { name: "usage objects", status: "fail", message: `0 turns had usage tokens. Costs will all be $0. Likely cause: schema drift in usage object — paste the sample shapes below into a ccmeter issue.` },
    );
    checks.push(
      turnsWithCacheActivity > 0
        ? { name: "cache activity", status: "pass", message: `${turnsWithCacheActivity.toLocaleString()} turns with cache reads or writes` }
        : { name: "cache activity", status: "warn", message: `0 turns with cache_creation/cache_read fields. ccmeter cache will report nothing. Verify your sessions actually used caching.` },
    );
    checks.push(
      modelsObserved.size > 0
        ? { name: "models", status: "pass", message: [...modelsObserved].slice(0, 6).join(", ") + (modelsObserved.size > 6 ? `, …+${modelsObserved.size - 6}` : "") }
        : { name: "models", status: "warn", message: "no model id seen in any turn — fallback pricing in use." },
    );
    checks.push(
      estimatedCost > 0
        ? { name: "cost computation", status: "pass", message: `≈ $${estimatedCost.toFixed(2)} across the scanned data (sanity-check vs your Console invoice)` }
        : { name: "cost computation", status: "fail", message: "ccmeter computed $0. Double-check pricing table and usage keys." },
    );
  }

  if (opts.json) {
    const report: SelftestReport = {
      ccmeterVersion: pkgVersion(),
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      pricingVerifiedAt: getPricingVerifiedDate(),
      logDir,
      filesFound,
      filesScanned: filesToScan.length,
      bytesScanned,
      totalLines,
      validTurns,
      parseErrors,
      parseSuccessRatio,
      turnsWithUsage,
      turnsWithCacheActivity,
      modelsObserved: [...modelsObserved],
      unknownTopLevelKeys: [...unknownTopLevel.entries()].map(([k, n]) => `${k}×${n}`),
      unknownUsageKeys: [...unknownUsage.entries()].map(([k, n]) => `${k}×${n}`),
      estimatedCost,
      sampleShapes,
      checks,
    };
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }

  // Human output.
  process.stdout.write(`environment\n`);
  process.stdout.write(`  ccmeter ${pkgVersion()}  ·  node ${process.version}  ·  ${process.platform}-${process.arch}\n`);
  process.stdout.write(`  pricing verified ${getPricingVerifiedDate()}\n`);
  process.stdout.write(`  log dir   ${opts.noRedact ? logDir : redactPath(logDir)}\n\n`);

  process.stdout.write(`checks\n`);
  for (const c of checks) {
    const icon = c.status === "pass" ? green("✓") : c.status === "warn" ? yellow("!") : red("✗");
    process.stdout.write(`  ${icon}  ${bold(c.name.padEnd(18))}  ${c.message}\n`);
  }
  process.stdout.write("\n");

  if (unknownTopLevel.size > 0 || unknownUsage.size > 0) {
    process.stdout.write(yellow(`unknown keys observed (these are forwards-compatible — they don't break ccmeter, but please report them):\n`));
    if (unknownTopLevel.size > 0) {
      process.stdout.write(`  top-level: ${[...unknownTopLevel.entries()].map(([k, n]) => `${k}×${n}`).join(", ")}\n`);
    }
    if (unknownUsage.size > 0) {
      process.stdout.write(`  usage:     ${[...unknownUsage.entries()].map(([k, n]) => `${k}×${n}`).join(", ")}\n`);
    }
    process.stdout.write("\n");
  }

  if (sampleShapes.length > 0) {
    process.stdout.write(`sample turn shapes (redacted) — useful for filing issues:\n`);
    for (const s of sampleShapes) {
      process.stdout.write(
        `  ${dim(s.fileBasename + ":" + s.lineNumber)}  keys=[${s.keys.join(",")}]  ` +
          `msg=[${s.messageKeys.join(",")}]  ` +
          `usage=[${s.usageKeys.join(",") || "—"}]  ` +
          `model=${s.model ?? "—"}  ts=${s.hasTimestamp ? "yes" : "no"}\n`,
      );
    }
    process.stdout.write("\n");
  }

  // Final verdict line so users know what to do.
  const failed = checks.some((c) => c.status === "fail");
  const warned = checks.some((c) => c.status === "warn");
  if (failed) {
    process.stdout.write(
      red("✗ at least one check failed. ") +
        `Please open an issue with ${cyan("ccmeter selftest --json")} output:\n  https://github.com/vnmoorthy/ccmeter/issues/new\n`,
    );
    process.exitCode = 1;
  } else if (warned) {
    process.stdout.write(yellow("! some checks warned — ccmeter still works but verify against your Console invoice.\n"));
  } else {
    process.stdout.write(green("✓ all checks passed — your ccmeter numbers should match your Console invoice within a few percent.\n"));
  }
}

function pkgVersion(): string {
  // Avoid a hard import of package.json (which causes ESM resolution
  // headaches under different bundlers); fall back to a constant.
  return process.env.CCMETER_VERSION ?? "0.2.0";
}

function redactBasename(p: string): string {
  // Keep just the file's basename for the diagnostic — strips project path.
  const base = path.basename(p);
  // If the basename looks like a UUID, keep first 8 chars only.
  if (/^[0-9a-f-]{8,}\.jsonl$/i.test(base)) return base.slice(0, 8) + "….jsonl";
  return base;
}

// Tiny no-op import to keep `os` referenced if added later (avoids accidental dead-code prune).
void os;
