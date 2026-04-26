import { describe, expect, test } from "vitest";
import { runRecommendations } from "../src/core/analysis/recommend/index.js";
import type { Analysis, Session } from "../src/core/types.js";

function fakeSession(over: Partial<Session>): Session {
  const base: Session = {
    id: "s1",
    projectPath: "/Users/x/p",
    startMs: Date.now() - 86_400_000,
    endMs: Date.now() - 86_400_000 + 60_000,
    durationMs: 60_000,
    models: ["claude-sonnet-4-6"],
    primaryModel: "claude-sonnet-4-6",
    turnCount: 5,
    toolUseCount: 0,
    cost: {
      inputCost: 0.01, outputCost: 0.02,
      cacheWriteCost: 0, cacheWrite5mCost: 0, cacheWrite1hCost: 0,
      cacheReadCost: 0, totalCost: 0.03,
      inputTokens: 1000, outputTokens: 100,
      cacheWriteTokens: 0, cacheReadTokens: 0,
      model: "claude-sonnet-4-6", cacheTier: "none",
    },
    cacheBusts: [],
    shape: "interactive",
    filePath: "/x/y.jsonl",
    ...over,
  };
  return base;
}

describe("recommendations", () => {
  test("does not crash on empty input", () => {
    const empty: Omit<Analysis, "recommendations"> = {
      generatedAt: Date.now(), rangeStartMs: 0, rangeEndMs: Date.now(),
      sessions: [], daily: [], byProject: [], byModel: [],
      totals: {
        totalCost: 0, inputTokens: 0, outputTokens: 0,
        cacheReadTokens: 0, cacheWriteTokens: 0,
        busts: 0, bustCost: 0, cacheHitRatio: 0, sessions: 0, turns: 0,
      },
      parseStats: { files: 0, bytes: 0, turns: 0, errors: 0, cacheHits: 0, cacheMisses: 0, durationMs: 0 },
    };
    const r = runRecommendations(empty);
    expect(r).toEqual([]);
  });

  test("idle-cache-bust rule fires when busts pile up", () => {
    const now = Date.now();
    const sessions: Session[] = Array.from({ length: 6 }, (_, i) =>
      fakeSession({
        id: `s-${i}`,
        startMs: now - 3 * 86_400_000,
        endMs: now - 3 * 86_400_000 + 60_000,
        cacheBusts: [
          { ts: now - 3 * 86_400_000, tier: "5m", gapSeconds: 600,
            writeCost: 1, hypotheticalReadCost: 0.05,
            wastedCost: 0.5, sessionId: `s-${i}` },
        ],
      }),
    );
    const a: Omit<Analysis, "recommendations"> = {
      generatedAt: now, rangeStartMs: now - 7 * 86_400_000, rangeEndMs: now,
      sessions, daily: [], byProject: [], byModel: [],
      totals: {
        totalCost: 6, inputTokens: 0, outputTokens: 0,
        cacheReadTokens: 0, cacheWriteTokens: 0,
        busts: 6, bustCost: 3, cacheHitRatio: 0, sessions: 6, turns: 30,
      },
      parseStats: { files: 1, bytes: 1, turns: 30, errors: 0, cacheHits: 0, cacheMisses: 1, durationMs: 1 },
    };
    const r = runRecommendations(a);
    expect(r.find((x) => x.id === "idle-cache-bust")).toBeTruthy();
  });
});
