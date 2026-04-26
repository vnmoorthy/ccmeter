// `ccmeter summary` — one-screen overview.

import asciichart from "asciichart";
import pc from "picocolors";
import { analyze } from "../../core/analyze.js";
import {
  bold,
  divider,
  fmtDuration,
  fmtPct,
  fmtTokens,
  fmtUSD,
  shortPath,
  trendArrow,
} from "../ui/format.js";
import { sparkline } from "../ui/sparkline.js";
import { renderTable } from "../ui/table.js";
import { pricingFor } from "../../core/pricing/models.js";

interface SummaryOpts {
  days?: string;
  project?: string;
  color?: boolean;
}

export async function runSummary(opts: SummaryOpts): Promise<void> {
  const days = parseInt(String(opts.days ?? 30), 10);
  const a = await analyze({ days, projectFilter: opts.project, fillGaps: true });

  const w = process.stdout.columns ? Math.min(process.stdout.columns, 88) : 80;
  const title = `ccmeter — last ${days} days${opts.project ? ` · ${opts.project}` : ""}`;
  process.stdout.write(`\n${bold(title)}\n${divider(w)}\n`);

  if (a.totals.sessions === 0) {
    process.stdout.write(
      `\n${pc.yellow("no Claude Code sessions found")} in the last ${days} days.\n\n` +
        pc.dim(`possible reasons:\n`) +
        pc.dim(`  • Claude Code isn't installed (yet)\n`) +
        pc.dim(`  • your logs live somewhere other than ~/.claude/projects\n`) +
        pc.dim(`    → set CCMETER_LOG_DIR or pass --log-dir <path>\n`) +
        pc.dim(`  • you've cleared the log directory recently\n\n`) +
        `try ${pc.cyan("ccmeter --demo")} to see the tool with synthetic data,\n` +
        `or ${pc.cyan("ccmeter doctor")} for a setup diagnosis.\n\n`,
    );
    return;
  }

  // top-line KPIs
  const totalCost = a.totals.totalCost;
  const dailyAvg = totalCost / Math.max(1, days);
  const monthRate = dailyAvg * 30;

  // delta vs previous equal window
  const half = Math.floor(a.daily.length / 2);
  const recent = a.daily.slice(half).reduce((acc, b) => acc + b.totalCost, 0);
  const prior = a.daily.slice(0, half).reduce((acc, b) => acc + b.totalCost, 0);
  const delta = prior === 0 ? 0 : (recent - prior) / prior;

  process.stdout.write(
    `Total spend       ${bold(fmtUSD(totalCost))}   (${trendArrow(delta)} vs prior period)\n` +
      `Daily average     ${bold(fmtUSD(dailyAvg))}   ≈ ${fmtUSD(monthRate)}/month\n` +
      `Sessions          ${bold(String(a.totals.sessions))}\n` +
      `Cache hit rate    ${bold(fmtPct(a.totals.cacheHitRatio))}\n` +
      `Cache busts       ${bold(String(a.totals.busts))}   wasted ${pc.yellow(fmtUSD(a.totals.bustCost))}\n` +
      `\n`,
  );

  // sparkline
  const series = a.daily.map((d) => d.totalCost);
  if (series.length >= 3) {
    process.stdout.write(`Daily spend  ${sparkline(series)}\n\n`);
  }

  // bigger chart
  if (series.some((v) => v > 0) && series.length >= 5) {
    const chart = asciichart.plot(series, { height: 6, format: (v: number) => `   $${v.toFixed(2)}` });
    process.stdout.write(chart + "\n\n");
  }

  // by model
  if (a.byModel.length > 0) {
    process.stdout.write(bold("Spend by model\n"));
    process.stdout.write(
      renderTable({
        head: ["Model", "Cost", "Turns", "In", "Out", "Cache R", "Cache W"],
        align: ["left", "right", "right", "right", "right", "right", "right"],
        rows: a.byModel.slice(0, 6).map((m) => [
          pricingFor(m.model).displayName ?? m.model,
          fmtUSD(m.totalCost),
          String(m.turns),
          fmtTokens(m.inputTokens),
          fmtTokens(m.outputTokens),
          fmtTokens(m.cacheReadTokens),
          fmtTokens(m.cacheWriteTokens),
        ]),
      }) + "\n\n",
    );
  }

  // by project
  if (a.byProject.length > 0) {
    process.stdout.write(bold("Top projects\n"));
    process.stdout.write(
      renderTable({
        head: ["Project", "Cost", "Sessions", "Hit %", "Bust $"],
        align: ["left", "right", "right", "right", "right"],
        rows: a.byProject.slice(0, 8).map((p) => [
          shortPath(p.projectPath, 42),
          fmtUSD(p.totalCost),
          String(p.sessions),
          fmtPct(p.cacheHitRatio, 0),
          fmtUSD(p.bustCost),
        ]),
      }) + "\n\n",
    );
  }

  // recommendations teaser
  if (a.recommendations.length > 0) {
    const top = a.recommendations.slice(0, 2);
    process.stdout.write(bold("Suggestions:\n"));
    for (const r of top) {
      const sev = r.severity === "high" ? pc.red("●") : r.severity === "warn" ? pc.yellow("●") : pc.cyan("●");
      const save =
        r.estimatedMonthlySavings > 0 ? pc.dim(` (save ${fmtUSD(r.estimatedMonthlySavings)}/mo)`) : "";
      process.stdout.write(`  ${sev} ${r.title}${save}\n`);
    }
    if (a.recommendations.length > 2) {
      process.stdout.write(pc.dim(`  + ${a.recommendations.length - 2} more — run `) + pc.cyan("ccmeter recommend") + pc.dim("\n"));
    }
    process.stdout.write("\n");
  }

  // footer with parse stats
  const ps = a.parseStats;
  process.stdout.write(
    pc.dim(
      `parsed ${ps.files} files (${(ps.bytes / 1024 / 1024).toFixed(1)}MB) in ${fmtDuration(ps.durationMs)} ` +
        `· cache ${ps.cacheHits}/${ps.cacheHits + ps.cacheMisses}` +
        (ps.errors ? ` · ${ps.errors} skipped lines` : "") +
        `\n`,
    ),
  );
  process.stdout.write(
    pc.dim(`run `) +
      pc.cyan("ccmeter dashboard") +
      pc.dim(` for the full UI · `) +
      pc.cyan("ccmeter cache") +
      pc.dim(` to dig into cache busts\n\n`),
  );
}
