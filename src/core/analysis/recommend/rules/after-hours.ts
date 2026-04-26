// Significant spend happening between 11pm-6am local — useful both as a
// well-being nudge and a sign of agentic loops left running overnight.

import type { Recommendation } from "../../../types.js";
import type { Rule } from "../index.js";

export const afterHoursRule: Rule = (a) => {
  const nightCost = a.sessions
    .filter((s) => {
      const hr = new Date(s.startMs).getHours();
      return hr >= 23 || hr < 6;
    })
    .reduce((acc, s) => acc + s.cost.totalCost, 0);
  if (nightCost < 10) return [];
  const total = a.totals.totalCost;
  const share = nightCost / Math.max(0.0001, total);
  if (share < 0.1) return [];

  const days = Math.max(1, Math.ceil((a.rangeEndMs - a.rangeStartMs) / 86_400_000));
  const monthly = nightCost * (30 / days);

  return [
    {
      id: "after-hours",
      severity: "info",
      title: `${(share * 100).toFixed(0)}% of spend happens between 11pm-6am`,
      body:
        `$${nightCost.toFixed(2)} of your spend in the last ${days} days came from sessions ` +
        `started overnight. Sometimes that's intentional batch work; sometimes it's an agentic ` +
        `loop you forgot was running. ` +
        `If unintended, set CLAUDE_CODE_MAX_RUNTIME or use \`pkill claude\` from a cron at 1am.`,
      estimatedMonthlySavings: 0,
      evidence: a.sessions
        .filter((s) => {
          const hr = new Date(s.startMs).getHours();
          return hr >= 23 || hr < 6;
        })
        .sort((x, y) => y.cost.totalCost - x.cost.totalCost)
        .slice(0, 4)
        .map((s) => ({
          sessionId: s.id,
          projectPath: s.projectPath,
          ts: s.startMs,
          note: `${new Date(s.startMs).toLocaleTimeString()}, $${s.cost.totalCost.toFixed(2)}`,
        })),
    },
  ];
};
