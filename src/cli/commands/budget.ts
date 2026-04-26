// `ccmeter budget` — set/check/clear monthly spend budget.

import pc from "picocolors";
import { analyze } from "../../core/analyze.js";
import { clearBudget, getBudget, setBudget } from "../../core/budget.js";
import { bold, fmtPct, fmtUSD } from "../ui/format.js";

interface BudgetOpts {
  set?: string;
  clear?: boolean;
}

export async function runBudget(opts: BudgetOpts): Promise<void> {
  if (opts.clear) {
    await clearBudget();
    process.stdout.write(pc.green("✓ budget cleared\n"));
    return;
  }
  if (opts.set) {
    const v = parseFloat(opts.set);
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error(`invalid budget amount: ${opts.set}`);
    }
    await setBudget(v);
    process.stdout.write(pc.green(`✓ monthly budget set: ${fmtUSD(v)}\n`));
    return;
  }

  const b = await getBudget();
  if (!b) {
    process.stdout.write(
      pc.dim("no budget set. try: ") + pc.cyan("ccmeter budget --set 200") + "\n",
    );
    return;
  }
  // current month spend
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const days = Math.max(1, Math.ceil((Date.now() - monthStart) / 86_400_000));
  const a = await analyze({ days });
  // include only this month
  const monthCost = a.sessions
    .filter((s) => s.startMs >= monthStart)
    .reduce((acc, s) => acc + s.cost.totalCost, 0);
  const ratio = monthCost / b.monthlyUsd;
  const projected = (monthCost / days) * 30;

  process.stdout.write(`\n${bold(`Monthly budget`)}\n`);
  process.stdout.write(`  Limit:        ${bold(fmtUSD(b.monthlyUsd))}\n`);
  process.stdout.write(`  Spent so far: ${bold(fmtUSD(monthCost))}   (${fmtPct(ratio)})\n`);
  process.stdout.write(
    `  Projected:    ${bold(fmtUSD(projected))}   ${
      projected > b.monthlyUsd
        ? pc.red(`(over by ${fmtUSD(projected - b.monthlyUsd)})`)
        : pc.green(`(under by ${fmtUSD(b.monthlyUsd - projected)})`)
    }\n\n`,
  );

  // ascii bar
  const w = 40;
  const filled = Math.min(w, Math.round(ratio * w));
  const bar =
    (ratio < 0.7 ? pc.green : ratio < 1 ? pc.yellow : pc.red)("█".repeat(filled)) +
    pc.dim("░".repeat(Math.max(0, w - filled)));
  process.stdout.write(`  ${bar}  ${fmtPct(ratio, 0)}\n\n`);
}
