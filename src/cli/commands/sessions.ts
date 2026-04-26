// `ccmeter sessions` — sortable session leaderboard.

import pc from "picocolors";
import { analyze } from "../../core/analyze.js";
import { renderTable } from "../ui/table.js";
import { bold, fmtDate, fmtDuration, fmtUSD, shortPath } from "../ui/format.js";

interface SessionsOpts {
  top?: string;
  sort?: string;
  project?: string;
  days?: string;
  tag?: string;
  json?: boolean;
}

export async function runSessions(opts: SessionsOpts): Promise<void> {
  const top = parseInt(String(opts.top ?? 25), 10);
  const days = parseInt(String(opts.days ?? 30), 10);
  const sort = String(opts.sort ?? "cost").toLowerCase();
  const a = await analyze({ days, projectFilter: opts.project });

  let sessions = a.sessions;
  if (opts.tag) {
    const tag = opts.tag.toLowerCase();
    sessions = sessions.filter((s) => s.tag?.toLowerCase() === tag);
  }
  const sorted = [...sessions].sort((x, y) => {
    switch (sort) {
      case "duration":
        return y.durationMs - x.durationMs;
      case "busts":
        return y.cacheBusts.length - x.cacheBusts.length;
      case "date":
        return y.startMs - x.startMs;
      case "cost":
      default:
        return y.cost.totalCost - x.cost.totalCost;
    }
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(sorted.slice(0, top), null, 2) + "\n");
    return;
  }

  const w = process.stdout.columns ? Math.min(process.stdout.columns, 100) : 100;
  process.stdout.write(
    `\n${bold(`Sessions — top ${Math.min(top, sorted.length)} of ${sorted.length}`)} ` +
      pc.dim(`sorted by ${sort}\n`),
  );
  process.stdout.write(
    renderTable({
      head: ["Date", "Project", "Model", "Dur", "Turns", "Cost", "Busts", "Shape", "Tag"],
      align: ["left", "left", "left", "right", "right", "right", "right", "left", "left"],
      rows: sorted.slice(0, top).map((s) => [
        fmtDate(s.startMs, "datetime"),
        shortPath(s.projectPath, 28),
        shortModel(s.primaryModel),
        fmtDuration(s.durationMs),
        String(s.turnCount),
        fmtUSD(s.cost.totalCost),
        s.cacheBusts.length === 0
          ? pc.dim("0")
          : s.cacheBusts.length > 5
            ? pc.red(String(s.cacheBusts.length))
            : pc.yellow(String(s.cacheBusts.length)),
        s.shape,
        s.tag ? pc.cyan(s.tag) : pc.dim("—"),
      ]),
    }) + "\n",
  );

  process.stdout.write(
    pc.dim(
      `\nshowing ${Math.min(top, sorted.length)} of ${sorted.length} total · ` +
        `inspect a session: ccmeter sessions --top 1 --json | jq\n`,
    ),
  );
  // hint to width
  if (w < 90)
    process.stdout.write(
      pc.dim(`(your terminal is narrow — wider gives a better view)\n`),
    );
}

function shortModel(m: string): string {
  return m
    .replace(/^claude-/, "")
    .replace(/-202\d{5,}/, "")
    .slice(0, 14);
}
