// `ccmeter compare` — quantify what changed period-over-period.
//
// The two questions users ask after seeing a bill jump:
//   1. "Did MY usage change, or did pricing change?"
//   2. "Which projects got more expensive?"
//
// `compare` answers both: it diffs the current N-day window against the prior
// N-day window and prints deltas across totals, by-project, and by-model.
// Particularly valuable for spotting the early-March 2026 cache-TTL rollout
// (anthropics/claude-code#46829) against your own pre-rollout baseline — most
// jumps don't show up until you compare against your own pre-jump baseline.

import pc from "picocolors";
import { analyze } from "../../core/analyze.js";
import { fmtUSD, fmtPct } from "../ui/format.js";
import { renderTable } from "../ui/table.js";

const { bold, dim, red, green } = pc;

export interface CompareOptions {
  periods?: string;
  json?: boolean;
}

export async function runCompare(opts: CompareOptions): Promise<void> {
  const [aDays = 7, bDays = 7] = (opts.periods ?? "7,7")
    .split(",")
    .map((s) => parseInt(s.trim(), 10) || 0);

  // We compute one big analysis covering both windows, then split locally
  // so every numeric path uses the same costing/recommendation pass.
  const big = await analyze({ days: aDays + bDays, fillGaps: false });
  const now = Date.now();
  const splitMs = now - aDays * 86_400_000;
  const fromMs = now - (aDays + bDays) * 86_400_000;

  const cur = big.sessions.filter((s) => s.endMs >= splitMs);
  const prv = big.sessions.filter((s) => s.endMs >= fromMs && s.endMs < splitMs);

  const sumCost = (xs: typeof cur) => xs.reduce((a, s) => a + s.cost.totalCost, 0);
  const sumBusts = (xs: typeof cur) =>
    xs.reduce((a, s) => a + s.cacheBusts.reduce((x, b) => x + b.wastedCost, 0), 0);
  const reads = (xs: typeof cur) => xs.reduce((a, s) => a + s.cost.cacheReadTokens, 0);
  const writes = (xs: typeof cur) => xs.reduce((a, s) => a + s.cost.cacheWriteTokens, 0);
  const ratio = (rd: number, wr: number) => (rd + wr === 0 ? 0 : rd / (rd + wr));

  const cs = sumCost(cur);
  const ps = sumCost(prv);
  const cb = sumBusts(cur);
  const pb = sumBusts(prv);
  const ch = ratio(reads(cur), writes(cur));
  const ph = ratio(reads(prv), writes(prv));

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          current: { days: aDays, cost: cs, bustCost: cb, hitRatio: ch, sessions: cur.length },
          prior: { days: bDays, cost: ps, bustCost: pb, hitRatio: ph, sessions: prv.length },
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  process.stdout.write(`\nCompare — last ${aDays}d vs prior ${bDays}d\n` + "─".repeat(72) + "\n");
  process.stdout.write(
    renderTable({
      head: ["Metric", `Last ${aDays}d`, `Prior ${bDays}d`, "Δ"],
      align: ["left", "right", "right", "right"],
      rows: [
        ["Total spend", fmtUSD(cs), fmtUSD(ps), arrow(cs - ps, fmtUSD(cs - ps, { sign: true }))],
        [
          "Daily avg",
          fmtUSD(cs / aDays),
          fmtUSD(ps / bDays),
          arrow(
            cs / aDays - ps / bDays,
            fmtUSD(cs / aDays - ps / bDays, { sign: true }),
          ),
        ],
        ["Sessions", String(cur.length), String(prv.length), arrow(cur.length - prv.length, signed(cur.length - prv.length))],
        ["Cache hit rate", fmtPct(ch), fmtPct(ph), arrow(ch - ph, fmtPct(ch - ph, 1))],
        ["Cache busts (wasted)", fmtUSD(cb), fmtUSD(pb), arrow(cb - pb, fmtUSD(cb - pb, { sign: true }))],
      ],
    }),
  );

  // Per-project deltas (only meaningful projects)
  const projects = uniqueProjects([...cur, ...prv]);
  const rows: string[][] = [];
  for (const p of projects) {
    const a = cur.filter((s) => s.projectPath === p).reduce((x, s) => x + s.cost.totalCost, 0);
    const b = prv.filter((s) => s.projectPath === p).reduce((x, s) => x + s.cost.totalCost, 0);
    if (a === 0 && b === 0) continue;
    const d = a - b;
    rows.push([
      shortProj(p),
      fmtUSD(a),
      fmtUSD(b),
      arrow(d, fmtUSD(d, { sign: true })),
    ]);
  }
  rows.sort((x, y) => parseFloat(y[1]!.replace(/[^\d.-]/g, "")) - parseFloat(x[1]!.replace(/[^\d.-]/g, "")));
  if (rows.length > 0) {
    process.stdout.write("\n" + bold("Per-project deltas") + "\n");
    process.stdout.write(
      renderTable({
        head: ["Project", "Now", "Before", "Δ"],
        align: ["left", "right", "right", "right"],
        rows: rows.slice(0, 12),
      }),
    );
  }

  // Insight line
  const pct = ps > 0 ? (cs - ps) / ps : 0;
  const insight = pct > 0.2
    ? `${red("↑")} spend up ${(pct * 100).toFixed(0)}% — try ${bold("ccmeter recommend")} for the biggest wins.`
    : pct < -0.2
      ? `${green("↓")} nice work — spend down ${(Math.abs(pct) * 100).toFixed(0)}%.`
      : dim("steady — no large delta.");
  process.stdout.write("\n" + insight + "\n");
}

function arrow(delta: number, label: string): string {
  if (Math.abs(delta) < 0.005) return dim("—");
  return delta > 0 ? red(`↑ ${label}`) : green(`↓ ${label}`);
}
function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
function uniqueProjects(xs: { projectPath: string }[]): string[] {
  const set = new Set<string>();
  for (const x of xs) set.add(x.projectPath);
  return [...set];
}
function shortProj(p: string): string {
  if (p.length <= 36) return p;
  return "…/" + p.split("/").slice(-2).join("/");
}
