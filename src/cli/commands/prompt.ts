// `ccmeter prompt` — emits a single line of text suitable for embedding in
// a shell prompt (PS1) showing today's spend. Designed to be fast (<150ms).

import { findSessionFiles, getDefaultLogDir } from "../../core/paths.js";
import { tailFile } from "../../core/jsonl/reader.js";
import { costForTurn } from "../../core/pricing/compute.js";

interface PromptOpts {
  format?: string;
  budget?: string;
  noColor?: boolean;
}

export async function runPrompt(opts: PromptOpts): Promise<void> {
  const startMs = startOfToday();
  const dir = getDefaultLogDir();
  const files = await findSessionFiles(dir).catch(() => []);
  let cost = 0;
  for (const f of files.slice(0, 30)) {
    if (f.mtimeMs < startMs) continue;
    const turns = await tailFile(f.path, 64 * 1024);
    for (const t of turns) {
      const ts = t.timestamp ? Date.parse(String(t.timestamp)) : 0;
      if (ts && ts < startMs) continue;
      cost += costForTurn(t).totalCost;
    }
  }
  const budget = opts.budget ? parseFloat(opts.budget) : 0;
  const useColor = opts.noColor !== true;
  const value = `$${cost < 100 ? cost.toFixed(2) : Math.round(cost)}`;
  const tag = `cc:${value}`;
  let out: string;
  if (budget > 0) {
    const dailyBudget = budget / 30;
    const ratio = cost / dailyBudget;
    const color =
      !useColor || ratio < 0.7 ? "" : ratio < 1 ? "\x1b[33m" : "\x1b[31m";
    const reset = useColor ? "\x1b[0m" : "";
    out = `${color}${tag}${reset}`;
  } else {
    const color = useColor ? "\x1b[2m" : "";
    const reset = useColor ? "\x1b[0m" : "";
    out = `${color}${tag}${reset}`;
  }
  process.stdout.write(out);
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
