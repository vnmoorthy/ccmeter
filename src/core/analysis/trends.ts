// Daily / weekly / monthly aggregations.
// All bucketing happens in the user's local TZ — the report should look right
// in their wall-clock terms.

import type { DailyBucket, ModelAggregate, ProjectAggregate, Session } from "../types.js";

export function bucketByDay(sessions: Session[]): DailyBucket[] {
  const map = new Map<string, DailyBucket>();
  for (const s of sessions) {
    // attribute the entire session's cost to its start day. cheap and
    // matches user mental model ("the session I started yesterday").
    const day = formatDay(s.startMs);
    let b = map.get(day);
    if (!b) {
      b = {
        date: day,
        totalCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        busts: 0,
        bustCost: 0,
        sessions: 0,
        turns: 0,
      };
      map.set(day, b);
    }
    b.totalCost += s.cost.totalCost;
    b.inputTokens += s.cost.inputTokens;
    b.outputTokens += s.cost.outputTokens;
    b.cacheWriteTokens += s.cost.cacheWriteTokens;
    b.cacheReadTokens += s.cost.cacheReadTokens;
    b.busts += s.cacheBusts.length;
    b.bustCost += s.cacheBusts.reduce((a, x) => a + x.wastedCost, 0);
    b.sessions += 1;
    b.turns += s.turnCount;
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function aggregateByProject(sessions: Session[]): ProjectAggregate[] {
  const map = new Map<string, ProjectAggregate>();
  for (const s of sessions) {
    let agg = map.get(s.projectPath);
    if (!agg) {
      agg = {
        projectPath: s.projectPath,
        totalCost: 0,
        sessions: 0,
        turns: 0,
        cacheHitRatio: 0,
        bustCost: 0,
      };
      map.set(s.projectPath, agg);
    }
    agg.totalCost += s.cost.totalCost;
    agg.sessions += 1;
    agg.turns += s.turnCount;
    agg.bustCost += s.cacheBusts.reduce((a, x) => a + x.wastedCost, 0);
  }
  // compute hit ratio per project
  for (const agg of map.values()) {
    let reads = 0;
    let writes = 0;
    for (const s of sessions) {
      if (s.projectPath !== agg.projectPath) continue;
      reads += s.cost.cacheReadTokens;
      writes += s.cost.cacheWriteTokens;
    }
    const denom = reads + writes;
    agg.cacheHitRatio = denom === 0 ? 0 : reads / denom;
  }
  return [...map.values()].sort((a, b) => b.totalCost - a.totalCost);
}

export function aggregateByModel(sessions: Session[]): ModelAggregate[] {
  const map = new Map<string, ModelAggregate>();
  for (const s of sessions) {
    const key = s.primaryModel;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        model: key,
        totalCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        turns: 0,
      };
      map.set(key, agg);
    }
    agg.totalCost += s.cost.totalCost;
    agg.inputTokens += s.cost.inputTokens;
    agg.outputTokens += s.cost.outputTokens;
    agg.cacheReadTokens += s.cost.cacheReadTokens;
    agg.cacheWriteTokens += s.cost.cacheWriteTokens;
    agg.turns += s.turnCount;
  }
  return [...map.values()].sort((a, b) => b.totalCost - a.totalCost);
}

/** Compare two periods of equal length. Returns delta % (positive = increase). */
export function compareWindows(curr: DailyBucket[], prev: DailyBucket[]): number {
  const c = curr.reduce((a, b) => a + b.totalCost, 0);
  const p = prev.reduce((a, b) => a + b.totalCost, 0);
  if (p === 0) return c === 0 ? 0 : 1;
  return (c - p) / p;
}

/** Fill missing dates between min and max with zero buckets (for nice charts). */
export function fillDailyGaps(buckets: DailyBucket[]): DailyBucket[] {
  if (buckets.length === 0) return buckets;
  const first = buckets[0]!.date;
  const last = buckets[buckets.length - 1]!.date;
  const start = new Date(first + "T00:00:00");
  const end = new Date(last + "T00:00:00");
  const map = new Map(buckets.map((b) => [b.date, b]));
  const out: DailyBucket[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = formatDay(d.getTime());
    out.push(
      map.get(k) ?? {
        date: k,
        totalCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        busts: 0,
        bustCost: 0,
        sessions: 0,
        turns: 0,
      },
    );
  }
  return out;
}

export function formatDay(ms: number): string {
  const d = new Date(ms);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
