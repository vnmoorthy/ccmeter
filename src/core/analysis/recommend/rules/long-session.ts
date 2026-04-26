// Long-running sessions where cache value erodes faster than work happens.

import type { Recommendation } from "../../../types.js";
import type { Rule } from "../index.js";

export const longSessionRule: Rule = (a) => {
  const long = a.sessions.filter((s) => s.durationMs > 90 * 60 * 1000); // > 90 min
  if (long.length < 2) return [];

  const totalBustCost = long.reduce(
    (acc, s) => acc + s.cacheBusts.reduce((x, b) => x + b.wastedCost, 0),
    0,
  );
  if (totalBustCost < 0.5) return [];

  const days = Math.max(1, Math.ceil((a.rangeEndMs - a.rangeStartMs) / 86_400_000));
  const monthly = totalBustCost * (30 / days);

  return [
    {
      id: "long-session",
      severity: monthly > 25 ? "warn" : "info",
      title: `${long.length} long sessions (>90 min) bled cache value`,
      body:
        `Sessions over 90 minutes accumulate cache busts because the 5-minute TTL expires ` +
        `during natural pauses (lunch, meetings, deep thinking). ` +
        `Across these sessions you wasted ~$${totalBustCost.toFixed(2)} on busts. ` +
        `Either restart sessions when you return from a break, or set the 1-hour cache tier ` +
        `for projects where you can predict you'll be away briefly.`,
      estimatedMonthlySavings: monthly,
      evidence: long
        .sort((x, y) => x.cost.totalCost - y.cost.totalCost)
        .slice(0, 5)
        .map((s) => ({
          sessionId: s.id,
          projectPath: s.projectPath,
          ts: s.startMs,
          note: `${(s.durationMs / 60000).toFixed(0)} min, ${s.cacheBusts.length} busts, $${s.cost.totalCost.toFixed(2)}`,
        })),
    },
  ];
};
