// Per-tool aggregation: confirm the rollup adds up correctly, ranks by
// attributed cost, and handles the empty-no-agentic case gracefully.

import { describe, it, expect } from "vitest";
import { aggregateByTool } from "../src/core/analysis/tools.js";
import type { Session } from "../src/core/types.js";

function fakeSession(
  id: string,
  toolCalls: Record<string, number>,
  toolCost: Record<string, number>,
): Session {
  return {
    id,
    projectPath: "/tmp/x",
    startMs: 0,
    endMs: 0,
    durationMs: 0,
    models: ["claude-opus-4-7"],
    primaryModel: "claude-opus-4-7",
    turnCount: 1,
    toolUseCount: 0,
    cost: {
      inputCost: 0,
      outputCost: 0,
      cacheWriteCost: 0,
      cacheWrite5mCost: 0,
      cacheWrite1hCost: 0,
      cacheReadCost: 0,
      totalCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      model: "claude-opus-4-7",
      cacheTier: "5m",
    },
    cacheBusts: [],
    shape: "interactive",
    filePath: "/tmp/x.jsonl",
    toolCalls,
    toolCost,
  };
}

describe("aggregateByTool", () => {
  it("returns empty list when no sessions used tools", () => {
    expect(aggregateByTool([])).toEqual([]);
    expect(aggregateByTool([fakeSession("a", {}, {})])).toEqual([]);
  });

  it("rolls up calls and cost across sessions and ranks by cost", () => {
    const out = aggregateByTool([
      fakeSession("a", { Bash: 3, Read: 2 }, { Bash: 1.0, Read: 0.4 }),
      fakeSession("b", { Bash: 1, Edit: 5 }, { Bash: 0.2, Edit: 1.5 }),
    ]);
    expect(out[0]?.name).toBe("Edit");
    expect(out[0]?.calls).toBe(5);
    expect(out[0]?.attributedCost).toBeCloseTo(1.5);
    expect(out.find((t) => t.name === "Bash")?.calls).toBe(4);
    expect(out.find((t) => t.name === "Bash")?.sessionsUsedIn).toBe(2);
    expect(out.find((t) => t.name === "Read")?.sessionsUsedIn).toBe(1);
  });

  it("computes avg cost per call", () => {
    const out = aggregateByTool([
      fakeSession("a", { Bash: 4 }, { Bash: 0.8 }),
    ]);
    expect(out[0]?.avgCostPerCall).toBeCloseTo(0.2);
  });
});
