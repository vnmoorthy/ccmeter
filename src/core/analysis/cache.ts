// Cache-bust detection.
//
// Definitions:
//   write turn → usage.cache_creation_input_tokens > 0 (5m or 1h tier)
//   read turn  → usage.cache_read_input_tokens > 0
//   bust       → a write that follows a previous write or read in the same
//                session, where the gap exceeds the cache TTL of the previous
//                cache entry. The user paid full input price (the write) when
//                a read would have been free-ish.
//
// Wasted cost is approximated as (this write cost) - (what a read on the same
// token count would have cost) at the model's price.

import { costForTurn, hypotheticalReadCost } from "../pricing/compute.js";
import { turnModel, type Turn } from "../jsonl/schema.js";
import type { CacheBust } from "../types.js";

const TTL_5M_S = 300;
const TTL_1H_S = 3600;

export interface CachePoint {
  t: Turn;
  ts: number | undefined;
}

export function detectCacheBusts(turns: CachePoint[], sessionId: string): CacheBust[] {
  const busts: CacheBust[] = [];
  let lastCacheActivityTs: number | undefined;
  let lastTier: "5m" | "1h" | undefined;

  for (const { t, ts } of turns) {
    const u = t.message?.usage;
    if (!u || ts === undefined) continue;

    const writes5m =
      u.cache_creation?.ephemeral_5m_input_tokens ??
      (u.cache_creation_input_tokens && !u.cache_creation?.ephemeral_1h_input_tokens
        ? u.cache_creation_input_tokens
        : 0);
    const writes1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const reads = u.cache_read_input_tokens ?? 0;
    const isWrite = (writes5m ?? 0) > 0 || (writes1h ?? 0) > 0;
    const isRead = (reads ?? 0) > 0;

    if (isWrite && lastCacheActivityTs !== undefined && lastTier !== undefined) {
      const gapSec = (ts - lastCacheActivityTs) / 1000;
      const ttl = lastTier === "1h" ? TTL_1H_S : TTL_5M_S;
      if (gapSec > ttl) {
        const tier: "5m" | "1h" = (writes1h ?? 0) > 0 ? "1h" : "5m";
        const c = costForTurn(t);
        const wastedTokens =
          (writes5m ?? 0) + (writes1h ?? 0); // tokens we re-paid for as a write
        const hypotheticalRead = hypotheticalReadCost(turnModel(t) ?? "default", wastedTokens);
        const writeCost = c.cacheWriteCost;
        const wastedCost = Math.max(0, writeCost - hypotheticalRead);
        busts.push({
          ts,
          tier,
          gapSeconds: gapSec,
          writeCost,
          hypotheticalReadCost: hypotheticalRead,
          wastedCost,
          sessionId,
        });
      }
    }

    if (isWrite || isRead) {
      lastCacheActivityTs = ts;
      // If the turn writes 1h, prefer the longer TTL for next-gap calc.
      lastTier = (writes1h ?? 0) > 0 ? "1h" : (writes5m ?? 0) > 0 ? "5m" : lastTier;
      if (isRead && !isWrite) {
        // a read just refreshes the cache for one more TTL window of the same tier
      }
    }
  }
  return busts;
}

/** Cache hit ratio across a stream of turns: read tokens / (read + write tokens). */
export function cacheHitRatio(turns: Turn[]): number {
  let reads = 0;
  let writes = 0;
  for (const t of turns) {
    const u = t.message?.usage;
    if (!u) continue;
    reads += u.cache_read_input_tokens ?? 0;
    writes +=
      (u.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
      (u.cache_creation?.ephemeral_1h_input_tokens ?? 0) +
      (u.cache_creation?.ephemeral_5m_input_tokens || u.cache_creation?.ephemeral_1h_input_tokens
        ? 0
        : (u.cache_creation_input_tokens ?? 0));
  }
  const denom = reads + writes;
  return denom === 0 ? 0 : reads / denom;
}
