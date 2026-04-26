// `ccmeter whatif` — simulate counterfactuals.
//
//   --swap opus->sonnet           replace every opus turn cost with the same
//                                 token counts repriced at sonnet rates
//   --cache-ttl 3600              re-detect busts under a different TTL
//   --disable-cache               assume cache reads cost full input price

import pc from "picocolors";
import { analyze } from "../../core/analyze.js";
import { pricingFor } from "../../core/pricing/models.js";
import { bold, divider, fmtUSD } from "../ui/format.js";

interface WhatIfOpts {
  days?: string;
  swap?: string[];
  cacheTtl?: string;
  disableCache?: boolean;
}

const FAMILY_TARGETS: Record<string, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
};

export async function runWhatIf(opts: WhatIfOpts): Promise<void> {
  const days = parseInt(String(opts.days ?? 30), 10);
  const a = await analyze({ days });
  const w = process.stdout.columns ? Math.min(process.stdout.columns, 88) : 80;

  process.stdout.write(`\n${bold(`What-if simulation — last ${days} days`)}\n${divider(w)}\n`);
  process.stdout.write(`Actual spend: ${bold(fmtUSD(a.totals.totalCost))}\n\n`);

  const swaps = parseSwaps(opts.swap ?? []);
  let simulatedTotal = 0;
  for (const s of a.sessions) {
    const targetModel = pickTarget(s.primaryModel, swaps) ?? s.primaryModel;
    const target = pricingFor(targetModel);
    const inCost = (s.cost.inputTokens / 1e6) * target.input;
    const outCost = (s.cost.outputTokens / 1e6) * target.output;
    const cacheRead = opts.disableCache
      ? (s.cost.cacheReadTokens / 1e6) * target.input
      : (s.cost.cacheReadTokens / 1e6) * target.cache_read;
    const cacheWrite = opts.disableCache
      ? 0
      : (s.cost.cacheWriteTokens / 1e6) * target.cache_5m_write;
    simulatedTotal += inCost + outCost + cacheRead + cacheWrite;
  }
  const delta = simulatedTotal - a.totals.totalCost;

  process.stdout.write(`Scenario:\n`);
  if (swaps.length > 0) {
    for (const sw of swaps) {
      process.stdout.write(`  • swap ${pc.bold(sw.from)} → ${pc.bold(sw.to)}\n`);
    }
  }
  if (opts.disableCache) {
    process.stdout.write(`  • cache disabled (every read becomes full input)\n`);
  }
  if (opts.cacheTtl && opts.cacheTtl !== "300") {
    process.stdout.write(
      `  • cache TTL: ${opts.cacheTtl}s (would re-bucket busts; needs phase-2 work)\n`,
    );
  }
  if (swaps.length === 0 && !opts.disableCache && (!opts.cacheTtl || opts.cacheTtl === "300")) {
    process.stdout.write(pc.dim(`  • no scenario flags set — try --swap opus->sonnet\n`));
  }
  process.stdout.write("\n");

  const colorDelta = delta < 0 ? pc.green : pc.red;
  process.stdout.write(
    `Simulated spend: ${bold(fmtUSD(simulatedTotal))}   ${colorDelta(
      `${delta > 0 ? "+" : ""}${fmtUSD(delta)}`,
    )} vs actual\n`,
  );
  if (delta < 0) {
    const monthly = (delta / days) * 30;
    process.stdout.write(
      pc.green(
        `\n→ This scenario would save ~${fmtUSD(-monthly)}/month at your current usage rate.\n`,
      ),
    );
  }
  process.stdout.write("\n");
}

interface Swap {
  from: string;
  to: string;
}

function parseSwaps(raw: string[]): Swap[] {
  const out: Swap[] = [];
  for (const r of raw) {
    const [from, to] = r.split("->").map((s) => s.trim().toLowerCase());
    if (!from || !to) continue;
    out.push({ from, to });
  }
  return out;
}

function pickTarget(model: string, swaps: Swap[]): string | undefined {
  for (const s of swaps) {
    if (model.includes(s.from)) {
      return FAMILY_TARGETS[s.to] ?? s.to;
    }
  }
  return undefined;
}
