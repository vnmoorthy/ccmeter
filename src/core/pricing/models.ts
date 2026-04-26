// Pricing table for every Claude model that has appeared in Claude Code.
//
// All prices are USD per million tokens. Numbers reflect Anthropic's public
// pricing page as of 2026-04-25. Override locally by writing a JSON file at
// ~/.config/ccmeter/pricing.json with the same shape; user values win.
//
// If a model id is observed that is not in the table, we fall back to the
// `default` row (sonnet-tier pricing) and warn once.

import fs from "node:fs/promises";
import path from "node:path";
import { getConfigDir } from "../paths.js";
import { log, warnOnce } from "../logger.js";

export interface ModelPricing {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M tokens written into the 5-minute cache. */
  cache_5m_write: number;
  /** USD per 1M tokens written into the 1-hour cache. */
  cache_1h_write: number;
  /** USD per 1M tokens read from cache. */
  cache_read: number;
  /** Optional human-readable display name. */
  displayName?: string;
}

const PRICING_VERIFIED_AT = "2026-04-26";

// Cache multipliers are universal across models (per Anthropic docs):
//   5m write = 1.25 × input
//   1h write = 2.00 × input
//   cache read = 0.10 × input

const BUILTIN: Record<string, ModelPricing> = {
  // Opus 4.x tier — verified $5 input / $25 output per Anthropic docs &
  // multiple secondary sources (April 2026). The 4.7 release notes
  // explicitly held headline pricing flat vs 4.6, 4.5, 4.1, 4.
  "claude-opus-4-7": {
    displayName: "Claude Opus 4.7",
    input: 5.0,
    output: 25.0,
    cache_5m_write: 6.25,
    cache_1h_write: 10.0,
    cache_read: 0.5,
  },
  "claude-opus-4-6": {
    displayName: "Claude Opus 4.6",
    input: 5.0,
    output: 25.0,
    cache_5m_write: 6.25,
    cache_1h_write: 10.0,
    cache_read: 0.5,
  },
  "claude-opus-4-5": {
    displayName: "Claude Opus 4.5",
    input: 5.0,
    output: 25.0,
    cache_5m_write: 6.25,
    cache_1h_write: 10.0,
    cache_read: 0.5,
  },
  "claude-opus-4-1": {
    displayName: "Claude Opus 4.1",
    input: 5.0,
    output: 25.0,
    cache_5m_write: 6.25,
    cache_1h_write: 10.0,
    cache_read: 0.5,
  },
  "claude-opus-4": {
    displayName: "Claude Opus 4",
    input: 5.0,
    output: 25.0,
    cache_5m_write: 6.25,
    cache_1h_write: 10.0,
    cache_read: 0.5,
  },
  // Legacy Claude 3 Opus retained at its historical $15/$75 since some
  // long-running session logs may still reference it.
  "claude-3-opus": {
    displayName: "Claude 3 Opus (legacy)",
    input: 15.0,
    output: 75.0,
    cache_5m_write: 18.75,
    cache_1h_write: 30.0,
    cache_read: 1.5,
  },

  // Sonnet tier
  "claude-sonnet-4-6": {
    displayName: "Claude Sonnet 4.6",
    input: 3.0,
    output: 15.0,
    cache_5m_write: 3.75,
    cache_1h_write: 6.0,
    cache_read: 0.3,
  },
  "claude-sonnet-4-5": {
    displayName: "Claude Sonnet 4.5",
    input: 3.0,
    output: 15.0,
    cache_5m_write: 3.75,
    cache_1h_write: 6.0,
    cache_read: 0.3,
  },
  "claude-sonnet-4": {
    displayName: "Claude Sonnet 4",
    input: 3.0,
    output: 15.0,
    cache_5m_write: 3.75,
    cache_1h_write: 6.0,
    cache_read: 0.3,
  },
  "claude-3-7-sonnet": {
    displayName: "Claude 3.7 Sonnet",
    input: 3.0,
    output: 15.0,
    cache_5m_write: 3.75,
    cache_1h_write: 6.0,
    cache_read: 0.3,
  },
  "claude-3-5-sonnet": {
    displayName: "Claude 3.5 Sonnet",
    input: 3.0,
    output: 15.0,
    cache_5m_write: 3.75,
    cache_1h_write: 6.0,
    cache_read: 0.3,
  },

  // Haiku tier
  "claude-haiku-4-5": {
    displayName: "Claude Haiku 4.5",
    input: 1.0,
    output: 5.0,
    cache_5m_write: 1.25,
    cache_1h_write: 2.0,
    cache_read: 0.1,
  },
  "claude-3-5-haiku": {
    displayName: "Claude 3.5 Haiku",
    input: 0.8,
    output: 4.0,
    cache_5m_write: 1.0,
    cache_1h_write: 1.6,
    cache_read: 0.08,
  },
  "claude-3-haiku": {
    displayName: "Claude 3 Haiku",
    input: 0.25,
    output: 1.25,
    cache_5m_write: 0.3,
    cache_1h_write: 0.5,
    cache_read: 0.03,
  },

  // Fallback when model id is unknown — assume Sonnet-tier costs.
  default: {
    displayName: "Unknown Model",
    input: 3.0,
    output: 15.0,
    cache_5m_write: 3.75,
    cache_1h_write: 6.0,
    cache_read: 0.3,
  },
};

let overrides: Record<string, Partial<ModelPricing>> = {};
let overridesLoaded = false;

export async function loadOverrides(): Promise<void> {
  if (overridesLoaded) return;
  overridesLoaded = true;
  const file = path.join(getConfigDir(), "pricing.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      overrides = parsed as Record<string, Partial<ModelPricing>>;
      log.info(`pricing overrides loaded from ${file}`);
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") log.warn(`pricing override read failed: ${e.message}`);
  }
}

/**
 * Resolve pricing for a model id. Matches by:
 *   1. exact override match
 *   2. exact builtin match
 *   3. prefix match against builtin keys (so "claude-opus-4-6-20251123" → "claude-opus-4-6")
 *   4. coarse contains match ("opus" → claude-opus-4-7)
 *   5. default
 */
export function pricingFor(rawModel: string | undefined): ModelPricing {
  if (!rawModel) return BUILTIN["default"]!;
  const m = rawModel.toLowerCase();
  if (overrides[m]) return mergeWithDefault(overrides[m], BUILTIN[m] ?? BUILTIN["default"]!);
  if (BUILTIN[m]) return BUILTIN[m]!;

  // prefix match — Anthropic appends a date suffix to released models
  for (const key of Object.keys(BUILTIN)) {
    if (key === "default") continue;
    if (m.startsWith(key)) return BUILTIN[key]!;
  }
  // contains match for the family (opus / sonnet / haiku)
  if (m.includes("opus")) return BUILTIN["claude-opus-4-7"]!;
  if (m.includes("sonnet")) return BUILTIN["claude-sonnet-4-6"]!;
  if (m.includes("haiku")) return BUILTIN["claude-haiku-4-5"]!;

  warnOnce(`pricing-${m}`, `unknown model "${m}", using default sonnet-tier pricing`);
  return BUILTIN["default"]!;
}

function mergeWithDefault(partial: Partial<ModelPricing>, base: ModelPricing): ModelPricing {
  return {
    displayName: partial.displayName ?? base.displayName,
    input: partial.input ?? base.input,
    output: partial.output ?? base.output,
    cache_5m_write: partial.cache_5m_write ?? base.cache_5m_write,
    cache_1h_write: partial.cache_1h_write ?? base.cache_1h_write,
    cache_read: partial.cache_read ?? base.cache_read,
  };
}

export function listModels(): Array<{ id: string; pricing: ModelPricing }> {
  return Object.entries(BUILTIN).map(([id, pricing]) => ({ id, pricing }));
}

export function getPricingVerifiedDate(): string {
  return PRICING_VERIFIED_AT;
}
