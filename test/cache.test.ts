import { describe, expect, test } from "vitest";
import { detectCacheBusts, type CachePoint } from "../src/core/analysis/cache.js";

function turn(opts: {
  ts: number;
  write5m?: number;
  write1h?: number;
  read?: number;
  model?: string;
}): CachePoint {
  return {
    ts: opts.ts,
    t: {
      timestamp: new Date(opts.ts).toISOString(),
      message: {
        model: opts.model ?? "claude-sonnet-4-6",
        usage: {
          cache_creation_input_tokens: (opts.write5m ?? 0) + (opts.write1h ?? 0),
          cache_creation: {
            ephemeral_5m_input_tokens: opts.write5m ?? 0,
            ephemeral_1h_input_tokens: opts.write1h ?? 0,
          },
          cache_read_input_tokens: opts.read ?? 0,
        },
      },
    } as never,
  };
}

describe("cache bust detection", () => {
  test("no busts when reads happen within TTL", () => {
    const t0 = Date.now();
    const turns: CachePoint[] = [
      turn({ ts: t0, write5m: 10000 }),
      turn({ ts: t0 + 60_000, read: 10000 }),
      turn({ ts: t0 + 120_000, read: 10000 }),
    ];
    expect(detectCacheBusts(turns, "s1")).toHaveLength(0);
  });

  test("write after >5min idle is a bust", () => {
    const t0 = Date.now();
    const turns: CachePoint[] = [
      turn({ ts: t0, write5m: 10000 }),
      turn({ ts: t0 + 6 * 60_000, write5m: 10000 }), // 6 min later — bust
    ];
    const busts = detectCacheBusts(turns, "s1");
    expect(busts).toHaveLength(1);
    expect(busts[0]!.tier).toBe("5m");
    expect(busts[0]!.gapSeconds).toBeGreaterThan(300);
  });

  test("1h tier respects 1h TTL", () => {
    const t0 = Date.now();
    const turns: CachePoint[] = [
      turn({ ts: t0, write1h: 10000 }),
      turn({ ts: t0 + 30 * 60_000, write1h: 10000 }), // 30 min — should NOT be a bust
    ];
    expect(detectCacheBusts(turns, "s1")).toHaveLength(0);
  });
});
