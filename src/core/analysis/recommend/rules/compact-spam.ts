// Frequent /compact-style restarts in the same session = trying to keep a
// long-lived context manageable but each compact is a non-trivial input cost.

import type { Recommendation } from "../../../types.js";
import type { Rule } from "../index.js";

export const compactSpamRule: Rule = (a) => {
  // Heuristic: sessions with > 30 turns AND average input tokens per turn > 80k
  // are spending most of their cost on context re-loading.
  const heavy = a.sessions.filter(
    (s) =>
      s.turnCount > 30 &&
      s.cost.inputTokens / s.turnCount > 80_000 &&
      s.cost.totalCost > 3,
  );
  if (heavy.length < 2) return [];

  const totalCost = heavy.reduce((a, s) => a + s.cost.totalCost, 0);
  const days = Math.max(1, Math.ceil((a.rangeEndMs - a.rangeStartMs) / 86_400_000));
  // Estimate ~25% of cost is avoidable by smaller, sub-agent-scoped contexts.
  const monthly = totalCost * 0.25 * (30 / days);

  return [
    {
      id: "compact-spam",
      severity: "warn",
      title: `${heavy.length} chat-bloat sessions: huge avg context per turn`,
      body:
        `These sessions averaged >80k input tokens per turn over >30 turns — meaning Claude is ` +
        `re-loading a giant context on every reply. Try delegating heavy work to subagents (Task tool) ` +
        `with focused contexts, then keep the main session lean. Could cut ~25% off these sessions.`,
      estimatedMonthlySavings: monthly,
      evidence: heavy
        .sort((x, y) => y.cost.totalCost - x.cost.totalCost)
        .slice(0, 4)
        .map((s) => ({
          sessionId: s.id,
          projectPath: s.projectPath,
          ts: s.startMs,
          note: `avg ${(s.cost.inputTokens / s.turnCount / 1000).toFixed(0)}k in/turn over ${s.turnCount} turns`,
        })),
    },
  ];
};
