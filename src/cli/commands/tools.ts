// `ccmeter tools` — per-tool cost breakdown.
//
// "Which subagent / tool ate the budget?" is the most-asked Claude Code
// question after the bill itself. This command lists every tool name that
// appeared in tool_use blocks in the window, ordered by attributed cost.

import pc from "picocolors";
import { analyze } from "../../core/analyze.js";
import { renderTable } from "../ui/table.js";
import { fmtUSD } from "../ui/format.js";

function fmtMoney(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "$0.00";
  if (digits === 2) return fmtUSD(n);
  // Sub-cent precision for $/call — the only place we need 4 digits.
  return `$${n.toFixed(digits)}`;
}

const { bold, dim, yellow } = pc;

export interface ToolsOptions {
  days?: string;
  project?: string;
  json?: boolean;
}

export async function runTools(opts: ToolsOptions): Promise<void> {
  const days = parseInt(opts.days ?? "30", 10);
  const a = await analyze({ days, projectFilter: opts.project, fillGaps: false });

  if (opts.json) {
    process.stdout.write(JSON.stringify({ byTool: a.byTool }, null, 2) + "\n");
    return;
  }

  process.stdout.write(`\nTools — last ${days} days\n`);
  process.stdout.write("─".repeat(80) + "\n");

  if (a.byTool.length === 0) {
    process.stdout.write(
      dim("No tool_use blocks in this window. Either nothing was agentic,") +
        "\n" +
        dim("or your sessions don't include tool_use payloads (older Claude Code).") +
        "\n",
    );
    return;
  }

  const totalAttrib = a.byTool.reduce((acc, t) => acc + t.attributedCost, 0);

  process.stdout.write(
    renderTable({
      head: ["Tool", "Calls", "Sessions", "Attributed $", "$/call", "Share"],
      align: ["left", "right", "right", "right", "right", "right"],
      rows: a.byTool.slice(0, 20).map((t) => [
        bold(t.name),
        fmtCount(t.calls),
        String(t.sessionsUsedIn),
        fmtMoney(t.attributedCost),
        fmtMoney(t.avgCostPerCall, 4),
        totalAttrib > 0 ? `${((t.attributedCost / totalAttrib) * 100).toFixed(1)}%` : "—",
      ]),
    }),
  );
  process.stdout.write("\n");

  process.stdout.write(
    dim(
      "Attributed cost = (this turn's output_cost + cache_write_cost) split equally\n" +
        "across the tool_use blocks in that turn. Input/cache_read overhead from tool\n" +
        "*results* is intentionally not attributed (under-attribute > overclaim).\n",
    ) + "\n",
  );

  // Cheap insight: highlight the most expensive avg-per-call tool, since
  // that's often the actionable signal ("WebFetch is N× pricier per call").
  const top = [...a.byTool].sort((x, y) => y.avgCostPerCall - x.avgCostPerCall)[0];
  if (top && top.calls >= 3) {
    process.stdout.write(
      `${yellow("→")} ${bold(top.name)} costs ${fmtMoney(top.avgCostPerCall, 4)} per call (${top.calls} calls). Investigate if this seems high.\n`,
    );
  }
}

function fmtCount(n: number): string {
  return n.toLocaleString();
}
