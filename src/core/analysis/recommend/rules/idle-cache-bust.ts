// Cache busts caused by sessions idling past the 5-minute TTL.
// Highest-leverage waste pattern after Anthropic's early-March-2026 default
// TTL change (1h→5m, anthropics/claude-code#46829).

import type { Recommendation } from "../../../types.js";
import type { Rule } from "../index.js";

export const idleCacheBustRule: Rule = (a) => {
  const last7Start = a.rangeEndMs - 7 * 86_400_000;
  const recentBusts = a.sessions
    .flatMap((s) => s.cacheBusts.map((b) => ({ b, s })))
    .filter(({ b }) => b.ts >= last7Start);

  const wasted = recentBusts.reduce((acc, { b }) => acc + b.wastedCost, 0);
  if (recentBusts.length < 5 || wasted < 1.0) return [];

  // project that to a month at the current run rate
  const monthly = wasted * (30 / 7);

  const evidence = recentBusts
    .sort((x, y) => y.b.wastedCost - x.b.wastedCost)
    .slice(0, 6)
    .map(({ b, s }) => ({
      sessionId: s.id,
      projectPath: s.projectPath,
      ts: b.ts,
      note: `gap ${Math.round(b.gapSeconds)}s, wasted $${b.wastedCost.toFixed(3)}`,
    }));

  const rec: Recommendation = {
    id: "idle-cache-bust",
    severity: monthly > 50 ? "high" : "warn",
    title: `Idle sessions are busting your cache ${recentBusts.length}× per week`,
    body:
      `In the last 7 days you re-paid the full input price ${recentBusts.length} times because ` +
      `more than 5 minutes elapsed between turns in the same session. That cost roughly ` +
      `$${wasted.toFixed(2)} last week (≈ $${monthly.toFixed(2)}/month at this rate).\n\n` +
      `Three concrete fixes, in order of impact:\n` +
      `  1. End sessions you're stepping away from — start fresh ones when you return.\n` +
      `  2. If you genuinely need long-lived context, opt sessions into the 1-hour cache ` +
      `tier (~1.6× the write cost; pays off with 2+ subsequent reads).\n` +
      `  3. Run \`/compact\` before long pauses; the smaller compacted context is cheaper to ` +
      `re-cache after a bust.`,
    estimatedMonthlySavings: monthly,
    evidence,
  };
  return [rec];
};
