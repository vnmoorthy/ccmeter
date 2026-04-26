// Per-tool cost rollup across sessions.
//
// "Which subagent / tool ate the budget?" is the most-asked Claude Code
// question after "why did my bill jump?". sessionize() computes per-session
// `toolCalls` and `toolCost` (output + cache_write attributed proportionally
// across tool_use blocks in each assistant turn). This file rolls those up
// to a single window-wide list, sorted by attributed cost.
//
// The estimate is documented in CLI output as "attributed cost" — input and
// cache_read tokens grow because of tool *results*, but we don't have a
// clean way to blame a specific tool for that growth, so we under-attribute
// rather than overclaim. The ranking is still meaningful.

import type { Session, ToolAggregate } from "../types.js";

export function aggregateByTool(sessions: Session[]): ToolAggregate[] {
  const calls = new Map<string, number>();
  const cost = new Map<string, number>();
  const sess = new Map<string, Set<string>>();

  for (const s of sessions) {
    for (const [name, n] of Object.entries(s.toolCalls)) {
      calls.set(name, (calls.get(name) ?? 0) + n);
      let set = sess.get(name);
      if (!set) {
        set = new Set();
        sess.set(name, set);
      }
      set.add(s.id);
    }
    for (const [name, c] of Object.entries(s.toolCost)) {
      cost.set(name, (cost.get(name) ?? 0) + c);
    }
  }

  const out: ToolAggregate[] = [];
  for (const [name, c] of calls) {
    const ac = cost.get(name) ?? 0;
    out.push({
      name,
      calls: c,
      sessionsUsedIn: sess.get(name)?.size ?? 0,
      attributedCost: ac,
      avgCostPerCall: c > 0 ? ac / c : 0,
    });
  }
  out.sort((x, y) => y.attributedCost - x.attributedCost || y.calls - x.calls);
  return out;
}
