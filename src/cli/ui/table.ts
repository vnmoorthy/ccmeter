// Thin wrapper around cli-table3 with sane defaults.

import Table from "cli-table3";
import pc from "picocolors";

export interface TableOpts {
  head: string[];
  rows: Array<string[]>;
  align?: Array<"left" | "right" | "center">;
}

export function renderTable(opts: TableOpts): string {
  const t = new Table({
    head: opts.head.map((h) => pc.bold(h)),
    style: { head: [], border: ["gray"] },
    chars: {
      top: "─",
      "top-mid": "┬",
      "top-left": "┌",
      "top-right": "┐",
      bottom: "─",
      "bottom-mid": "┴",
      "bottom-left": "└",
      "bottom-right": "┘",
      left: "│",
      "left-mid": "├",
      mid: "─",
      "mid-mid": "┼",
      right: "│",
      "right-mid": "┤",
      middle: "│",
    },
    colAligns: opts.align ?? opts.head.map(() => "left"),
  });
  for (const row of opts.rows) t.push(row);
  return t.toString();
}
