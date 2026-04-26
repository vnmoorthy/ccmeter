// Agentic sessions that ran past a sane budget — many tool calls, ballooning
// cost, and few user prompts. Probably a stuck loop or runaway plan-mode.

import type { Recommendation } from "../../../types.js";
import type { Rule } from "../index.js";

export const agenticBlowupRule: Rule = (a) => {
  const blowups = a.sessions.filter(
    (s) =>
      s.shape === "agentic" &&
      s.cost.totalCost > 5 &&
      s.toolUseCount > 50 &&
      s.toolUseCount / Math.max(1, s.turnCount) > 5,
  );
  if (blowups.length === 0) return [];

  const totalLeak = blowups.reduce((a, s) => a + s.cost.totalCost, 0);
  const days = Math.max(1, Math.ceil((a.rangeEndMs - a.rangeStartMs) / 86_400_000));
  const monthly = totalLeak * (30 / days) * 0.5; // assume half are avoidable

  return [
    {
      id: "agentic-blowup",
      severity: "high",
      title: `${blowups.length} agentic sessions ran wild`,
      body:
        `These sessions racked up >50 tool calls and >$5 each — usually a stuck retry loop, ` +
        `a misconfigured agent, or an over-eager plan. ` +
        `Add a max-iterations cap to your subagents and consider the \`/cost\` slash command ` +
        `to monitor spend mid-session. Total: $${totalLeak.toFixed(2)}.`,
      estimatedMonthlySavings: monthly,
      evidence: blowups
        .sort((x, y) => y.cost.totalCost - x.cost.totalCost)
        .slice(0, 5)
        .map((s) => ({
          sessionId: s.id,
          projectPath: s.projectPath,
          ts: s.startMs,
          note: `${s.toolUseCount} tool calls, ${s.turnCount} turns, $${s.cost.totalCost.toFixed(2)}`,
        })),
    },
  ];
};
