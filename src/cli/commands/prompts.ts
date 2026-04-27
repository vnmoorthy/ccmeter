// `ccmeter prompts` — per-prompt quality scoring.
//
// "Which of my prompts gave me the most output per dollar?" Rank assistant
// turns by their output-tokens / total-turn-cost ratio. The top of the
// ranking is high-yield prompts (concise input → useful output). The bottom
// is low-yield (lots of cache + input → little output).
//
// Useful for self-coaching: look at the bottom-N to identify patterns where
// you're paying for cache-write overhead without getting useful output, and
// the top-N to identify what shapes of prompt give the best ROI.

import path from "node:path";
import { findSessionFiles, getDefaultLogDir } from "../../core/paths.js";
import { parseFile } from "../../core/jsonl/reader.js";
import { costForTurn } from "../../core/pricing/compute.js";
import {
  turnHasUsage,
  turnTimestampMs,
  type Turn,
} from "../../core/jsonl/schema.js";
import { fmtUSD, fmtTokens, fmtDate } from "../ui/format.js";
import { renderTable } from "../ui/table.js";
import pc from "picocolors";

const { bold, dim, green, red, yellow } = pc;

interface PromptRow {
  ts: number;
  /** First ~80 characters of the user prompt that triggered this assistant turn. */
  promptPreview: string;
  outputTokens: number;
  cost: number;
  yield: number;          // output tokens per dollar
  toolNames: string[];
}

export interface PromptsOptions {
  days?: string;
  top?: string;
  bottom?: string;
  json?: boolean;
}

export async function runPrompts(opts: PromptsOptions): Promise<void> {
  const days = parseInt(opts.days ?? "30", 10);
  const top = parseInt(opts.top ?? "10", 10);
  const bot = parseInt(opts.bottom ?? "10", 10);

  const sinceMs = Date.now() - days * 86_400_000;
  const files = await findSessionFiles(getDefaultLogDir()).catch(() => []);

  const rows: PromptRow[] = [];
  for (const f of files) {
    if (f.mtimeMs < sinceMs - 7 * 86_400_000) continue; // skip ancient files
    const r = await parseFile(f.path, "prompts", f.mtimeMs, f.size);
    // Walk turns. Track the most recent user prompt; when we see an assistant
    // turn with usage, attach the previous user prompt as preview.
    let lastUserText: string | undefined;
    for (const t of r.turns) {
      const ts = turnTimestampMs(t);
      if (ts === undefined || ts < sinceMs) continue;

      // Capture user prompt text.
      if (t.message?.role === "user" && t.message.content) {
        lastUserText = extractText(t);
        continue;
      }
      // Score assistant turns.
      if (t.message?.role !== "assistant") continue;
      if (!turnHasUsage(t)) continue;
      const c = costForTurn(t);
      const out = c.outputTokens;
      const cost = c.totalCost;
      if (out === 0 || cost <= 0.000_001) continue;
      rows.push({
        ts,
        promptPreview: clip(lastUserText ?? "(no prior user prompt)"),
        outputTokens: out,
        cost,
        yield: out / cost,
        toolNames: extractToolNames(t),
      });
    }
  }

  if (rows.length === 0) {
    process.stdout.write(
      dim(`no scoreable assistant turns in the last ${days} days. Either no Claude Code activity, or your sessions don't include usage payloads.\n`),
    );
    return;
  }

  rows.sort((a, b) => b.yield - a.yield);
  const best = rows.slice(0, top);
  const worst = rows.slice(-bot).reverse();

  if (opts.json) {
    process.stdout.write(JSON.stringify({ best, worst }, null, 2) + "\n");
    return;
  }

  process.stdout.write(`\n${bold(`Prompt quality — last ${days} days`)} ${dim(`· ${rows.length} scored turns`)}\n`);
  process.stdout.write(dim("─".repeat(80)) + "\n\n");

  process.stdout.write(green(`Top ${best.length} — most output per dollar (high yield)\n`));
  process.stdout.write(
    renderTable({
      head: ["When", "Prompt preview", "Output", "Cost", "Tokens/$"],
      align: ["left", "left", "right", "right", "right"],
      rows: best.map((r) => [
        fmtDate(r.ts, "datetime"),
        r.promptPreview,
        fmtTokens(r.outputTokens),
        fmtUSD(r.cost),
        Math.round(r.yield).toLocaleString(),
      ]),
    }),
  );

  process.stdout.write("\n" + red(`Bottom ${worst.length} — least output per dollar (low yield)\n`));
  process.stdout.write(
    renderTable({
      head: ["When", "Prompt preview", "Output", "Cost", "Tokens/$"],
      align: ["left", "left", "right", "right", "right"],
      rows: worst.map((r) => [
        fmtDate(r.ts, "datetime"),
        r.promptPreview,
        fmtTokens(r.outputTokens),
        fmtUSD(r.cost),
        Math.round(r.yield).toLocaleString(),
      ]),
    }),
  );

  // Insight: median yield + a how-to-improve hint.
  const median = rows[Math.floor(rows.length / 2)]?.yield ?? 0;
  process.stdout.write(
    "\n" +
      dim(
        `Median yield: ${Math.round(median).toLocaleString()} output tokens / $.\n` +
          `Low-yield turns usually pay for big cached input but produce little output —\n` +
          `often happens after a long idle (cache bust) or with vague prompts that\n` +
          `make Claude think but not write. See ${yellow("ccmeter recommend")} for fixes.\n`,
      ),
  );
}

/** Extract text content from a turn's message, regardless of content shape. */
function extractText(t: Turn): string {
  const c = t.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const parts: string[] = [];
    for (const block of c) {
      if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
        const text = (block as { text?: unknown }).text;
        if (typeof text === "string") parts.push(text);
      }
    }
    return parts.join(" ");
  }
  return "";
}

function extractToolNames(t: Turn): string[] {
  if (!Array.isArray(t.message?.content)) return [];
  const out: string[] = [];
  for (const c of t.message?.content as unknown[]) {
    if (c && typeof c === "object" && (c as { type?: string }).type === "tool_use") {
      const nm = (c as { name?: unknown }).name;
      if (typeof nm === "string") out.push(nm);
    }
  }
  return out;
}

function clip(s: string): string {
  const cleaned = s.replace(/\s+/g, " ").trim();
  return cleaned.length <= 60 ? cleaned : cleaned.slice(0, 57) + "…";
}

// Touch path import so dead-code prune doesn't drop it; some future revisions
// will rejoin paths against the project root.
void path;
