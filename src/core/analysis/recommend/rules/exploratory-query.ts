// Sessions that load tons of input but produce minimal output —
// "I just wanted to ask a quick question but Claude re-read the entire repo".

import type { Recommendation } from "../../../types.js";
import type { Rule } from "../index.js";

export const exploratoryQueryRule: Rule = (a) => {
  const candidates = a.sessions.filter(
    (s) => s.cost.inputTokens > 50_000 && s.cost.outputTokens < 500 && s.turnCount <= 3,
  );
  if (candidates.length < 3) return [];

  const totalCost = candidates.reduce((acc, s) => acc + s.cost.totalCost, 0);
  // if we'd asked the same question with a tighter context (~5k tokens), cost
  // would shrink by roughly inputTokens delta. Approximate savings as 60% of
  // current input cost for these sessions.
  const monthly =
    candidates.reduce((acc, s) => acc + s.cost.inputCost * 0.6, 0) *
    (30 / Math.max(1, daysCovered(a)));

  const evidence = candidates
    .sort((x, y) => y.cost.totalCost - x.cost.totalCost)
    .slice(0, 5)
    .map((s) => ({
      sessionId: s.id,
      projectPath: s.projectPath,
      ts: s.startMs,
      note: `${kfmt(s.cost.inputTokens)} in / ${s.cost.outputTokens} out — $${s.cost.totalCost.toFixed(3)}`,
    }));

  return [
    {
      id: "exploratory-query",
      severity: monthly > 30 ? "warn" : "info",
      title: `${candidates.length} oversized sessions for tiny outputs`,
      body:
        `These sessions loaded huge contexts (>50k tokens) for replies under 500 tokens — a sign ` +
        `Claude Code re-indexed your repo for what could have been a quick question. ` +
        `Total spent: $${totalCost.toFixed(2)}. ` +
        `Try targeted prompts that name a specific file or function instead of asking broadly.`,
      estimatedMonthlySavings: monthly,
      evidence,
    },
  ];
};

function daysCovered(a: { rangeStartMs: number; rangeEndMs: number }): number {
  return Math.max(1, Math.ceil((a.rangeEndMs - a.rangeStartMs) / 86_400_000));
}

function kfmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}
