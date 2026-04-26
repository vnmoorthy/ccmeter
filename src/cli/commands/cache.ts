// `ccmeter cache` — focused cache-efficiency view.

import asciichart from "asciichart";
import pc from "picocolors";
import { analyze } from "../../core/analyze.js";
import { bold, divider, fmtDate, fmtPct, fmtUSD, shortPath } from "../ui/format.js";
import { renderTable } from "../ui/table.js";
import { sparkline } from "../ui/sparkline.js";

interface CacheOpts {
  days?: string;
  project?: string;
}

// The cache-TTL rollout was staggered through early March 2026 (per
// anthropics/claude-code#46829). We use the start of March as the
// auto-detection boundary; the actual "knee" in any user's data depends on
// when their machine got the new default.
const TTL_ROLLOUT_START = new Date("2026-03-01T00:00:00").getTime();

export async function runCache(opts: CacheOpts): Promise<void> {
  const days = parseInt(String(opts.days ?? 30), 10);
  const a = await analyze({ days, projectFilter: opts.project, fillGaps: true });
  const w = process.stdout.columns ? Math.min(process.stdout.columns, 88) : 80;

  process.stdout.write(`\n${bold(`Cache health — last ${days} days`)}\n${divider(w)}\n`);

  const last7 = a.daily.slice(-7);
  const bustCost7 = last7.reduce((acc, b) => acc + b.bustCost, 0);
  const monthly = bustCost7 * (30 / 7);

  process.stdout.write(
    `Hit rate          ${bold(fmtPct(a.totals.cacheHitRatio))}\n` +
      `Total busts       ${bold(String(a.totals.busts))}\n` +
      `Wasted on busts   ${pc.yellow(bold(fmtUSD(a.totals.bustCost)))}\n` +
      `Last 7d wasted    ${pc.yellow(fmtUSD(bustCost7))}   ≈ ${fmtUSD(monthly)}/month\n\n`,
  );

  // bust sparkline
  const bustSeries = a.daily.map((d) => d.busts);
  if (bustSeries.length >= 3) {
    process.stdout.write(`Daily busts   ${sparkline(bustSeries)}\n\n`);
  }

  // Cache-TTL rollout callout if data spans early March 2026.
  if (a.rangeStartMs < TTL_ROLLOUT_START && a.rangeEndMs > TTL_ROLLOUT_START) {
    const before = a.daily.filter((d) => new Date(d.date).getTime() < TTL_ROLLOUT_START);
    const after = a.daily.filter((d) => new Date(d.date).getTime() >= TTL_ROLLOUT_START);
    const beforeAvg =
      before.reduce((a, b) => a + b.bustCost, 0) / Math.max(1, before.length);
    const afterAvg =
      after.reduce((a, b) => a + b.bustCost, 0) / Math.max(1, after.length);
    if (afterAvg > beforeAvg * 1.5) {
      process.stdout.write(
        pc.yellow("⚠ ") +
          bold("Cache-TTL rollout (early March 2026) is visible in your data:\n") +
          pc.dim(
            `   pre-Mar 2026 daily bust cost ≈ ${fmtUSD(beforeAvg)}, post ≈ ${fmtUSD(afterAvg)} ` +
              `(${(afterAvg / Math.max(0.001, beforeAvg)).toFixed(1)}× higher).\n` +
              `   This matches Anthropic's 1h→5m default change. See ccmeter recommend.\n\n`,
          ),
      );
    }
  }

  // hit-rate chart over time
  const hrSeries = a.daily.map((d) => {
    const denom = d.cacheReadTokens + d.cacheWriteTokens;
    return denom === 0 ? 0 : d.cacheReadTokens / denom;
  });
  if (hrSeries.some((v) => v > 0)) {
    process.stdout.write(bold("Cache hit rate (%)\n"));
    process.stdout.write(
      asciichart.plot(
        hrSeries.map((v: number) => v * 100),
        { height: 5, format: (v: number) => `   ${v.toFixed(0)}%` },
      ) + "\n\n",
    );
  }

  // top sessions by bust cost
  const worst = [...a.sessions]
    .filter((s) => s.cacheBusts.length > 0)
    .sort(
      (x, y) =>
        y.cacheBusts.reduce((a, b) => a + b.wastedCost, 0) -
        x.cacheBusts.reduce((a, b) => a + b.wastedCost, 0),
    )
    .slice(0, 10);

  if (worst.length > 0) {
    process.stdout.write(bold("Worst offenders\n"));
    process.stdout.write(
      renderTable({
        head: ["Started", "Project", "Busts", "Wasted", "Worst gap"],
        align: ["left", "left", "right", "right", "right"],
        rows: worst.map((s) => {
          const wasted = s.cacheBusts.reduce((a, b) => a + b.wastedCost, 0);
          const worstGap = Math.max(...s.cacheBusts.map((b) => b.gapSeconds));
          return [
            fmtDate(s.startMs),
            shortPath(s.projectPath, 30),
            String(s.cacheBusts.length),
            fmtUSD(wasted),
            `${Math.round(worstGap)}s`,
          ];
        }),
      }) + "\n\n",
    );
  } else {
    process.stdout.write(pc.green("✓ No cache busts detected in this window.\n\n"));
  }

  process.stdout.write(
    pc.dim("How busts are calculated: a cache write that follows previous cache activity in\n") +
      pc.dim("the same session by more than the cache's TTL (300s for 5m, 3600s for 1h).\n"),
  );
}
