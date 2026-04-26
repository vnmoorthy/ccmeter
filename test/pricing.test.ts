import { describe, expect, test } from "vitest";
import { costForTurn } from "../src/core/pricing/compute.js";
import { pricingFor } from "../src/core/pricing/models.js";

describe("pricing", () => {
  test("known sonnet model resolves and computes a cost", () => {
    const p = pricingFor("claude-sonnet-4-6");
    expect(p.input).toBeCloseTo(3.0);
  });

  test("date-suffixed model id resolves via prefix match", () => {
    const p = pricingFor("claude-sonnet-4-6-20251201");
    expect(p.input).toBeCloseTo(3.0);
  });

  test("falls back to family contains for unknown ids", () => {
    const p = pricingFor("claude-opus-future-9000");
    // Opus 4.x is $5/$25 since 2026-04-26 verification.
    expect(p.input).toBeCloseTo(5.0);
    expect(p.output).toBeCloseTo(25.0);
  });

  test("Opus 4.7 base rates verified 2026-04-26", () => {
    const p = pricingFor("claude-opus-4-7");
    expect(p.input).toBeCloseTo(5.0);
    expect(p.output).toBeCloseTo(25.0);
    expect(p.cache_5m_write).toBeCloseTo(6.25);
    expect(p.cache_1h_write).toBeCloseTo(10.0);
    expect(p.cache_read).toBeCloseTo(0.5);
  });

  test("legacy claude-3-opus retains historical $15/$75", () => {
    const p = pricingFor("claude-3-opus");
    expect(p.input).toBeCloseTo(15.0);
    expect(p.output).toBeCloseTo(75.0);
  });

  test("computes input + output + cache write 5m", () => {
    const turn = {
      message: {
        model: "claude-sonnet-4-6",
        usage: {
          input_tokens: 1000,
          output_tokens: 100,
          cache_creation_input_tokens: 10000,
          cache_creation: { ephemeral_5m_input_tokens: 10000 },
        },
      },
    } as const;
    const c = costForTurn(turn as never);
    // 1k input * $3/M = $0.003
    expect(c.inputCost).toBeCloseTo(0.003, 6);
    // 100 output * $15/M = $0.0015
    expect(c.outputCost).toBeCloseTo(0.0015, 6);
    // 10k cache_5m_write * $3.75/M = $0.0375
    expect(c.cacheWrite5mCost).toBeCloseTo(0.0375, 5);
    expect(c.cacheTier).toBe("5m");
  });

  test("tolerates usage at the top level (older Claude Code shape)", () => {
    const turn = {
      message: { model: "claude-sonnet-4-6", role: "assistant" },
      // unconventional placement — costForTurn must still find this
      usage: {
        input_tokens: 1000,
        output_tokens: 100,
      },
    } as const;
    const c = costForTurn(turn as never);
    expect(c.inputCost).toBeCloseTo(0.003, 6);
    expect(c.outputCost).toBeCloseTo(0.0015, 6);
  });

  test("legacy cache_creation_input_tokens treated as 5m", () => {
    const turn = {
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 },
      },
    } as const;
    const c = costForTurn(turn as never);
    // 1M tokens at sonnet 5m write rate = $3.75
    expect(c.cacheWrite5mCost).toBeCloseTo(3.75, 4);
    expect(c.cacheTier).toBe("5m");
  });
});
