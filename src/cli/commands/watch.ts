// `ccmeter watch` — live status line of today's spend as JSONLs are appended.

import pc from "picocolors";
import { findSessionFiles, getDefaultLogDir } from "../../core/paths.js";
import { tailFile } from "../../core/jsonl/reader.js";
import { costForTurn } from "../../core/pricing/compute.js";
import { fmtUSD } from "../ui/format.js";

interface WatchOpts {
  interval?: string;
}

export async function runWatch(opts: WatchOpts): Promise<void> {
  const intervalMs = parseInt(String(opts.interval ?? 2000), 10);
  const dir = getDefaultLogDir();
  const startMs = startOfToday();

  process.stdout.write(pc.dim(`watching ${dir} every ${intervalMs}ms — Ctrl-C to stop\n`));

  let lastBytes = 0;
  let prevTotal = 0;

  // Eternal loop until SIGINT.
  while (true) {
    try {
      const files = await findSessionFiles(dir);
      let bytes = 0;
      let cost = 0;
      let turns = 0;
      let sessions = 0;
      let bursts = 0;
      const seenSessions = new Set<string>();
      for (const f of files) {
        if (f.mtimeMs < startMs) continue;
        bytes += f.size;
        // tail just the last 256k for speed; adjust if your sessions are huge
        const recent = await tailFile(f.path, 256 * 1024);
        for (const t of recent) {
          const ts = t.timestamp ? Date.parse(String(t.timestamp)) : 0;
          if (ts && ts < startMs) continue;
          const c = costForTurn(t);
          cost += c.totalCost;
          turns += 1;
          if (t.sessionId) seenSessions.add(t.sessionId);
        }
        sessions = seenSessions.size;
      }
      const delta = bytes - lastBytes;
      lastBytes = bytes;
      const sign = cost > prevTotal ? pc.red("↑") : cost < prevTotal ? pc.green("↓") : pc.dim("·");
      prevTotal = cost;
      bursts = delta > 1024 * 100 ? 1 : 0;
      const line =
        `today: ${pc.bold(fmtUSD(cost))} ${sign}  ` +
        `${turns} turns  ${sessions} sessions  ` +
        (bursts ? pc.yellow(`+${(delta / 1024).toFixed(0)}KB`) : pc.dim(`+${(delta / 1024).toFixed(0)}KB`));
      // overwrite the previous line
      process.stdout.write("\r" + line.padEnd(80) + " ");
    } catch (err) {
      process.stderr.write(`\nwatch error: ${(err as Error).message}\n`);
    }
    await sleep(intervalMs);
  }
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
