// `ccmeter share` — emit a copy-pasteable Markdown stat-card or social SVG.
//
// Why: people post their Claude Code spend screenshots on Reddit and Twitter
// to compare notes. A `ccmeter share` block gets organic distribution every
// time someone runs it, which is exactly the surface area that turns a
// utility into a 10k-star repo. Privacy by default: no project paths, no
// session ids, no user names — just shaped numbers.

import pc from "picocolors";
import { analyze } from "../../core/analyze.js";
import { fmtUSD } from "../ui/format.js";

const { dim } = pc;

export interface ShareOptions {
  days?: string;
  format?: string; // md | svg
  out?: string;
  /** if true, include numeric range bands rather than precise totals */
  fuzzy?: boolean;
}

export async function runShare(opts: ShareOptions): Promise<void> {
  const days = parseInt(opts.days ?? "30", 10);
  const a = await analyze({ days, fillGaps: false });

  const fmt = (opts.format ?? "md").toLowerCase();
  const card = fmt === "svg" ? makeSvg(a, days, !!opts.fuzzy) : makeMd(a, days, !!opts.fuzzy);

  if (opts.out) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(opts.out, card, "utf8");
    process.stderr.write(dim(`wrote ${opts.out}\n`));
  } else {
    process.stdout.write(card);
    if (!card.endsWith("\n")) process.stdout.write("\n");
  }
}

/** Markdown card — paste into Reddit, GitHub issues, blog posts. */
function makeMd(a: Awaited<ReturnType<typeof analyze>>, days: number, fuzzy: boolean): string {
  const total = fuzzy ? bandify(a.totals.totalCost) : fmtUSD(a.totals.totalCost);
  const hit = (a.totals.cacheHitRatio * 100).toFixed(1);
  const monthly = fuzzy
    ? bandify((a.totals.totalCost / days) * 30)
    : fmtUSD((a.totals.totalCost / days) * 30);
  const wasted = fmtUSD(a.totals.bustCost);
  const sparkData = a.daily.slice(-Math.min(30, a.daily.length)).map((d) => d.totalCost);
  const spark = textSpark(sparkData);

  const top = [...a.byModel].sort((x, y) => y.totalCost - x.totalCost).slice(0, 3);
  const modelLine = top.map((m) => `${shortModel(m.model)} ${fmtUSD(m.totalCost)}`).join(" · ");

  return [
    `**My Claude Code spend — last ${days} days** _(via [ccmeter](https://github.com/vnmoorthy/ccmeter))_`,
    "",
    "```",
    `Total spend     ${total}     (≈ ${monthly}/mo at this rate)`,
    `Cache hit rate  ${hit}%`,
    `Cache busts     ${a.totals.busts} (wasted ${wasted})`,
    `Daily spend     ${spark}`,
    `Models used     ${modelLine}`,
    "```",
    "",
    `_Generated locally by ccmeter ${new Date().toISOString().slice(0, 10)}. No source code, prompts, or paths leave your machine._`,
    "",
  ].join("\n");
}

/** Square-ish SVG card — works as an attachment on Twitter / Mastodon. */
function makeSvg(
  a: Awaited<ReturnType<typeof analyze>>,
  days: number,
  fuzzy: boolean,
): string {
  const W = 800;
  const H = 420;
  const total = fuzzy ? bandify(a.totals.totalCost) : fmtUSD(a.totals.totalCost);
  const hit = (a.totals.cacheHitRatio * 100).toFixed(1) + "%";
  const wasted = fmtUSD(a.totals.bustCost);
  const monthly = fuzzy
    ? bandify((a.totals.totalCost / days) * 30)
    : fmtUSD((a.totals.totalCost / days) * 30);

  // Daily-spend bar chart at the bottom.
  const series = a.daily.slice(-30).map((d) => d.totalCost);
  const max = Math.max(0.01, ...series);
  const barW = (W - 80) / Math.max(1, series.length);
  const baseY = H - 60;
  const bars = series
    .map((v, i) => {
      const h = Math.max(1, (v / max) * 120);
      const x = 40 + i * barW;
      const y = baseY - h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="#eaff00" rx="2"/>`;
    })
    .join("");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#0b0b0c"/>`,
    `<text x="40" y="56" font-family="ui-monospace,Menlo,monospace" font-weight="700" font-size="22" fill="#eaff00">ccmeter</text>`,
    `<text x="${W - 40}" y="56" font-family="ui-monospace,Menlo,monospace" font-size="13" fill="#7a7d83" text-anchor="end">last ${days} days · local · no telemetry</text>`,
    `<text x="40" y="120" font-family="ui-monospace,Menlo,monospace" font-size="13" fill="#7a7d83">total spend</text>`,
    `<text x="40" y="160" font-family="ui-monospace,Menlo,monospace" font-weight="700" font-size="42" fill="#fafafa">${esc(total)}</text>`,
    `<text x="40" y="190" font-family="ui-monospace,Menlo,monospace" font-size="13" fill="#7a7d83">≈ ${esc(monthly)}/month at this rate</text>`,
    `<text x="${W - 40}" y="120" font-family="ui-monospace,Menlo,monospace" font-size="13" fill="#7a7d83" text-anchor="end">cache hit rate</text>`,
    `<text x="${W - 40}" y="160" font-family="ui-monospace,Menlo,monospace" font-weight="700" font-size="42" fill="${a.totals.cacheHitRatio >= 0.6 ? "#7eff8e" : "#ff8a4d"}" text-anchor="end">${hit}</text>`,
    `<text x="${W - 40}" y="190" font-family="ui-monospace,Menlo,monospace" font-size="13" fill="#7a7d83" text-anchor="end">${a.totals.busts} busts wasted ${esc(wasted)}</text>`,
    `<text x="40" y="${baseY + 40}" font-family="ui-monospace,Menlo,monospace" font-size="11" fill="#7a7d83">daily spend</text>`,
    `<text x="${W - 40}" y="${baseY + 40}" font-family="ui-monospace,Menlo,monospace" font-size="11" fill="#7a7d83" text-anchor="end">github.com/vnmoorthy/ccmeter</text>`,
    bars,
    `</svg>`,
  ].join("\n");
}

function textSpark(series: number[]): string {
  if (series.length === 0) return "";
  const blocks = "▁▂▃▄▅▆▇█";
  const max = Math.max(...series, 0.0001);
  return series
    .map((v) => {
      const idx = Math.max(0, Math.min(7, Math.round((v / max) * 7)));
      return blocks[idx];
    })
    .join("");
}

function bandify(n: number): string {
  // Round to a friendly band, e.g. $200 / $300 / $1k. Useful when sharing.
  if (n < 1) return "<$1";
  if (n < 10) return `~$${Math.round(n)}`;
  if (n < 100) return `~$${Math.round(n / 10) * 10}`;
  if (n < 1000) return `~$${Math.round(n / 50) * 50}`;
  return `~$${(Math.round(n / 100) * 100).toLocaleString()}`;
}

function shortModel(m: string): string {
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  return m;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
}
