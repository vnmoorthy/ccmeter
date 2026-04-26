// 1h cache writes that never get re-read — i.e. you paid 1.6× for a longer
// TTL but didn't actually keep the session warm. Switch back to 5m or end faster.

import type { Recommendation } from "../../../types.js";
import type { Rule } from "../index.js";

export const stale1hCacheRule: Rule = (a) => {
  const candidates = a.sessions.filter(
    (s) => s.cost.cacheWrite1hCost > 0.05 && s.cost.cacheReadTokens === 0,
  );
  if (candidates.length < 2) return [];

  const overpaid = candidates.reduce(
    (acc, s) => acc + (s.cost.cacheWrite1hCost - s.cost.cacheWrite5mCost * 0.625),
    0,
  );
  if (overpaid < 0.5) return [];

  const days = Math.max(1, Math.ceil((a.rangeEndMs - a.rangeStartMs) / 86_400_000));
  const monthly = overpaid * (30 / days);

  return [
    {
      id: "stale-1h-cache",
      severity: "warn",
      title: `1-hour cache tier paid for, never read`,
      body:
        `${candidates.length} sessions wrote into the 1-hour cache tier but never read from it. ` +
        `1h tier costs ~1.6× the 5m tier; if you're not benefiting from the longer TTL, switch ` +
        `back to default. Roughly $${overpaid.toFixed(2)} overspent.`,
      estimatedMonthlySavings: monthly,
      evidence: candidates
        .sort((x, y) => y.cost.cacheWrite1hCost - x.cost.cacheWrite1hCost)
        .slice(0, 5)
        .map((s) => ({
          sessionId: s.id,
          projectPath: s.projectPath,
          ts: s.startMs,
          note: `1h write $${s.cost.cacheWrite1hCost.toFixed(3)}, no reads`,
        })),
    },
  ];
};
