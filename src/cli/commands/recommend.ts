// `ccmeter recommend` — actionable suggestions sorted by monthly savings.

import pc from "picocolors";
import { analyze } from "../../core/analyze.js";
import { bold, divider, fmtDate, fmtUSD, shortPath } from "../ui/format.js";

interface RecOpts {
  days?: string;
  minSavings?: string;
  json?: boolean;
}

export async function runRecommend(opts: RecOpts): Promise<void> {
  const days = parseInt(String(opts.days ?? 30), 10);
  const minSav = parseFloat(String(opts.minSavings ?? 0));
  const a = await analyze({ days });

  let recs = a.recommendations.filter((r) => r.estimatedMonthlySavings >= minSav);
  if (opts.json) {
    process.stdout.write(JSON.stringify(recs, null, 2) + "\n");
    return;
  }

  const w = process.stdout.columns ? Math.min(process.stdout.columns, 88) : 80;
  process.stdout.write(`\n${bold(`Recommendations — last ${days} days`)}\n${divider(w)}\n`);

  if (recs.length === 0) {
    process.stdout.write(pc.green("✓ No recommendations — your usage looks healthy.\n\n"));
    process.stdout.write(
      pc.dim(
        `(rules don't fire when there isn't enough signal. as you accumulate history,\n` +
          `more nuanced suggestions will surface.)\n`,
      ),
    );
    return;
  }

  const totalSavings = recs.reduce((acc, r) => acc + r.estimatedMonthlySavings, 0);
  process.stdout.write(
    pc.dim(
      `Estimated monthly savings if you act on all of these: ${pc.bold(fmtUSD(totalSavings))}\n\n`,
    ),
  );

  for (const r of recs) {
    const sevColor = r.severity === "high" ? pc.red : r.severity === "warn" ? pc.yellow : pc.cyan;
    const sevLabel = sevColor(`[${r.severity.toUpperCase()}]`);
    const save =
      r.estimatedMonthlySavings > 0
        ? pc.dim(` save ~${fmtUSD(r.estimatedMonthlySavings)}/mo`)
        : "";
    process.stdout.write(`${sevLabel} ${bold(r.title)}${save}\n`);
    for (const line of wrap(r.body, w - 2)) {
      process.stdout.write(`  ${line}\n`);
    }
    if (r.evidence.length > 0) {
      process.stdout.write(pc.dim(`  ─ evidence ─\n`));
      for (const e of r.evidence.slice(0, 4)) {
        process.stdout.write(
          pc.dim(
            `   • ${fmtDate(e.ts)}  ${shortPath(e.projectPath, 32)}  ${e.note ? `(${e.note})` : ""}\n`,
          ),
        );
      }
    }
    process.stdout.write("\n");
  }

  process.stdout.write(
    pc.dim(
      `Want a recommendation we don't have? PR a rule into\n` +
        `src/core/analysis/recommend/rules/ — there's a 30-line template at _template.ts.\n`,
    ),
  );
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (para.length <= width) {
      out.push(para);
      continue;
    }
    const words = para.split(/\s+/);
    let line = "";
    for (const word of words) {
      if (line.length + word.length + 1 > width) {
        out.push(line);
        line = word;
      } else {
        line = line ? line + " " + word : word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}
