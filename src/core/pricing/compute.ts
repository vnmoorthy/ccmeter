// Convert a raw turn's `usage` into a Cost object.
// Stored in dollars as floats. Round only on display.

import type { Turn } from "../jsonl/schema.js";
import { turnModel, turnUsage } from "../jsonl/schema.js";
import type { Cost } from "../types.js";
import { pricingFor, type ModelPricing } from "./models.js";

const MILLION = 1_000_000;

export function costForTurn(turn: Turn): Cost {
  const model = turnModel(turn) ?? "default";
  const pricing = pricingFor(model);
  // Use turnUsage() so we tolerate the older Claude Code shape that put
  // `usage` at the top level of the turn instead of inside `.message`.
  const u = turnUsage(turn) ?? {};

  const inputTokens = num(u.input_tokens);
  const outputTokens = num(u.output_tokens);
  const cacheReadTokens = num(u.cache_read_input_tokens);

  // The Anthropic API returns either the legacy field
  // `cache_creation_input_tokens` (5m only by default) or the new structured
  // `cache_creation: { ephemeral_5m_input_tokens, ephemeral_1h_input_tokens }`.
  // Handle both. If only the legacy field is present, treat it as 5m.
  let write5m = 0;
  let write1h = 0;
  if (u.cache_creation && typeof u.cache_creation === "object") {
    write5m = num(u.cache_creation.ephemeral_5m_input_tokens);
    write1h = num(u.cache_creation.ephemeral_1h_input_tokens);
  }
  const totalCacheCreation = num(u.cache_creation_input_tokens);
  if (totalCacheCreation > 0 && write5m + write1h === 0) {
    write5m = totalCacheCreation;
  }
  const cacheWriteTokens = write5m + write1h;

  const inputCost = (inputTokens / MILLION) * pricing.input;
  const outputCost = (outputTokens / MILLION) * pricing.output;
  const cacheRead = (cacheReadTokens / MILLION) * pricing.cache_read;
  const cacheWrite5m = (write5m / MILLION) * pricing.cache_5m_write;
  const cacheWrite1h = (write1h / MILLION) * pricing.cache_1h_write;
  const cacheWrite = cacheWrite5m + cacheWrite1h;
  const total = inputCost + outputCost + cacheRead + cacheWrite;

  let cacheTier: Cost["cacheTier"];
  if (write5m > 0 && write1h > 0) cacheTier = "mixed";
  else if (write5m > 0) cacheTier = "5m";
  else if (write1h > 0) cacheTier = "1h";
  else cacheTier = "none";

  return {
    inputCost,
    outputCost,
    cacheWriteCost: cacheWrite,
    cacheWrite5mCost: cacheWrite5m,
    cacheWrite1hCost: cacheWrite1h,
    cacheReadCost: cacheRead,
    totalCost: total,
    inputTokens,
    outputTokens,
    cacheWriteTokens,
    cacheReadTokens,
    model,
    cacheTier,
  };
}

/** Cost a hypothetical cache read of N tokens at the given model's price. */
export function hypotheticalReadCost(model: string, tokens: number): number {
  return (tokens / MILLION) * pricingFor(model).cache_read;
}

/** Cost a hypothetical cache write of N tokens at the given tier. */
export function hypotheticalWriteCost(
  model: string,
  tokens: number,
  tier: "5m" | "1h" = "5m",
): number {
  const p: ModelPricing = pricingFor(model);
  const rate = tier === "1h" ? p.cache_1h_write : p.cache_5m_write;
  return (tokens / MILLION) * rate;
}

/** Cost a hypothetical raw input of N tokens (no cache). */
export function hypotheticalInputCost(model: string, tokens: number): number {
  return (tokens / MILLION) * pricingFor(model).input;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function emptyCost(model = "default"): Cost {
  return {
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
    model,
    cacheTier: "none",
  };
}

export function addCost(a: Cost, b: Cost): Cost {
  return {
    inputCost: a.inputCost + b.inputCost,
    outputCost: a.outputCost + b.outputCost,
    cacheWriteCost: a.cacheWriteCost + b.cacheWriteCost,
    cacheWrite5mCost: a.cacheWrite5mCost + b.cacheWrite5mCost,
    cacheWrite1hCost: a.cacheWrite1hCost + b.cacheWrite1hCost,
    cacheReadCost: a.cacheReadCost + b.cacheReadCost,
    totalCost: a.totalCost + b.totalCost,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    model: a.model === b.model ? a.model : "mixed",
    cacheTier:
      a.cacheTier === b.cacheTier
        ? a.cacheTier
        : a.cacheTier === "none"
          ? b.cacheTier
          : b.cacheTier === "none"
            ? a.cacheTier
            : "mixed",
  };
}
