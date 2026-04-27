// `ccmeter reconcile` — diff ccmeter's local total vs Anthropic's authoritative
// usage data for the same window.
//
// Why: the most common comment-section question is "why doesn't ccmeter
// match my Console invoice?" This command pulls Anthropic's own usage
// number (the one that bills you) and prints the delta vs ccmeter.
//
// Auth: requires ANTHROPIC_API_KEY in env. We never read .anthropic/credentials
// or any other file — only the env var, and only when this command runs. The
// key is sent in a single request to api.anthropic.com and never written to
// disk.
//
// Endpoint: as of this writing Anthropic does not publish a stable usage-by-
// API-key endpoint with documented schema. We attempt
// https://api.anthropic.com/v1/organizations/usage_report (a known, evolving
// endpoint) and gracefully fall back to a "this requires a feature Anthropic
// hasn't shipped yet" message if it returns 404 or an unexpected shape.

import { analyze } from "../../core/analyze.js";
import { fmtUSD } from "../ui/format.js";
import pc from "picocolors";

const { bold, dim, green, yellow, red, cyan } = pc;

export interface ReconcileOptions {
  days?: string;
  json?: boolean;
}

interface UsageBreakdown {
  startMs: number;
  endMs: number;
  totalUsd: number | undefined;       // undefined when Anthropic doesn't expose $$ totals
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export async function runReconcile(opts: ReconcileOptions): Promise<void> {
  const days = parseInt(opts.days ?? "30", 10);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    process.stderr.write(
      red("ANTHROPIC_API_KEY is not set in your environment.\n") +
        dim("Reconcile reads usage from Anthropic's API. Without a key it can't ") +
        dim("compare against ccmeter's number.\n\n") +
        `Quick setup:\n  export ANTHROPIC_API_KEY=sk-ant-...\n  ccmeter reconcile --days ${days}\n\n` +
        dim("The key is used only for one HTTPS GET to api.anthropic.com and ") +
        dim("never written to disk.\n"),
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`\n${bold(`ccmeter reconcile — last ${days} days`)}\n`);
  process.stdout.write(dim("─".repeat(72)) + "\n\n");

  // Local number first (cheap, always works).
  const local = await analyze({ days, fillGaps: false });
  process.stdout.write(`${cyan("ccmeter (local)")}\n`);
  process.stdout.write(`  ${bold(fmtUSD(local.totals.totalCost))}\n`);
  process.stdout.write(
    `  ${dim(`${local.totals.sessions.toLocaleString()} sessions, ${local.totals.turns.toLocaleString()} turns`)}\n\n`,
  );

  // Anthropic number — best-effort.
  process.stdout.write(`${cyan("Anthropic API")}\n`);
  let remote: UsageBreakdown | null = null;
  try {
    remote = await fetchUsage(apiKey, days);
  } catch (err) {
    const msg = (err as Error).message;
    process.stdout.write(
      `  ${yellow("⚠ couldn't fetch:")} ${msg}\n` +
        dim(
          "  This usually means Anthropic hasn't shipped a stable usage-by-key\n" +
            "  endpoint yet, or your key doesn't have organization-usage scope.\n" +
            "  See https://docs.anthropic.com/en/api/admin-api for current state.\n",
        ),
    );
    return;
  }
  if (!remote) {
    process.stdout.write(
      `  ${yellow("⚠ no usage data returned for this window.")}\n` +
        dim(`  Try --days 7 (smaller window often resolves it).\n`),
    );
    return;
  }

  if (remote.totalUsd !== undefined) {
    process.stdout.write(`  ${bold(fmtUSD(remote.totalUsd))}\n`);
  }
  process.stdout.write(
    `  ${dim(
      `input ${remote.inputTokens.toLocaleString()}, output ${remote.outputTokens.toLocaleString()}, ` +
        `cache R ${remote.cacheReadTokens.toLocaleString()}, cache W ${remote.cacheWriteTokens.toLocaleString()}`,
    )}\n\n`,
  );

  if (remote.totalUsd !== undefined) {
    const delta = local.totals.totalCost - remote.totalUsd;
    const pct = remote.totalUsd > 0 ? (delta / remote.totalUsd) * 100 : 0;
    const arrow = Math.abs(pct) < 5 ? green("✓ within 5%") : Math.abs(pct) < 15 ? yellow("~ within 15%") : red("✗ off by >15%");
    process.stdout.write(`${bold("delta")}  ${fmtUSD(delta, { sign: true })}  (${pct.toFixed(1)}%)  ${arrow}\n`);
    if (Math.abs(pct) >= 15) {
      process.stdout.write(
        "\n" +
          yellow("→ ") +
          "Big delta. Common causes:\n" +
          dim("  · Anthropic includes API usage outside Claude Code; ccmeter only sees Claude Code logs.\n") +
          dim("  · Your pricing table may be stale. Run `ccmeter pricing` to inspect.\n") +
          dim("  · Some sessions may have been deleted from ~/.claude/projects.\n"),
      );
    }
  }

  if (opts.json) {
    process.stdout.write(
      "\n" +
        JSON.stringify(
          {
            local: {
              totalUsd: local.totals.totalCost,
              sessions: local.totals.sessions,
              turns: local.totals.turns,
            },
            remote,
          },
          null,
          2,
        ) +
        "\n",
    );
  }
}

/**
 * Best-effort call to Anthropic's organization-usage report. The endpoint
 * shape is in flux (admin API), so we read defensively and only return what
 * we can confidently extract. Returns null when no data; throws with a
 * specific reason when the request itself failed.
 */
async function fetchUsage(apiKey: string, days: number): Promise<UsageBreakdown | null> {
  const startMs = Date.now() - days * 86_400_000;
  const start = new Date(startMs).toISOString().slice(0, 10); // YYYY-MM-DD
  const end = new Date().toISOString().slice(0, 10);

  // Try the documented admin endpoint first.
  const url = `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${start}&ending_at=${end}`;
  const res = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`auth failed (${res.status}). Your API key needs org-admin scope.`);
  }
  if (res.status === 404) {
    throw new Error(`endpoint not available on your account (404).`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}.`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("response was not JSON.");
  }

  return normalizeUsageReport(data, startMs);
}

/** Walk an unknown response shape and accumulate any token / dollar fields
 * we recognize. Tolerant by design — if Anthropic adds fields we just ignore
 * them. If they rename existing fields, we'll under-count rather than fail. */
function normalizeUsageReport(data: unknown, startMs: number): UsageBreakdown | null {
  const out: UsageBreakdown = {
    startMs,
    endMs: Date.now(),
    totalUsd: undefined,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  let dollarsSeen = false;
  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "number") {
        if (k === "uncached_input_tokens" || k === "input_tokens") out.inputTokens += v;
        else if (k === "output_tokens") out.outputTokens += v;
        else if (k === "cache_read_input_tokens") out.cacheReadTokens += v;
        else if (k === "cache_creation_input_tokens" || k === "cache_creation_5m_input_tokens" || k === "cache_creation_1h_input_tokens") {
          out.cacheWriteTokens += v;
        } else if (k === "total_cost_usd" || k === "cost_usd") {
          dollarsSeen = true;
          out.totalUsd = (out.totalUsd ?? 0) + v;
        }
      } else if (typeof v === "object" && v !== null) {
        walk(v);
      }
    }
  }
  walk(data);
  if (
    out.inputTokens === 0 &&
    out.outputTokens === 0 &&
    out.cacheReadTokens === 0 &&
    out.cacheWriteTokens === 0 &&
    !dollarsSeen
  ) {
    return null;
  }
  return out;
}
