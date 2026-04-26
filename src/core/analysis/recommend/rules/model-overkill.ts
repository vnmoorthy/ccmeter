// Using Opus when Sonnet (or Haiku) would have done. Heuristic: turns where
// output_tokens < 500 and there are no tool_uses are usually quick Q&A that
// Sonnet handles fine — but Opus is 5× the cost of Sonnet on output.

import type { Recommendation } from "../../../types.js";
import type { Rule } from "../index.js";
import { pricingFor } from "../../../pricing/models.js";

export const modelOverkillRule: Rule = (a) => {
  const opusSessions = a.sessions.filter((s) => s.primaryModel.includes("opus"));
  if (opusSessions.length === 0) return [];

  const overkill = opusSessions.filter(
    (s) => s.cost.outputTokens < 500 * Math.max(1, s.turnCount) && s.toolUseCount === 0,
  );
  if (overkill.length < 2) return [];

  // estimate savings if these had run on Sonnet at the same token counts
  let opusCost = 0;
  let sonnetCost = 0;
  const sonnet = pricingFor("claude-sonnet-4-6");
  for (const s of overkill) {
    opusCost += s.cost.totalCost;
    sonnetCost +=
      (s.cost.inputTokens * sonnet.input +
        s.cost.outputTokens * sonnet.output +
        s.cost.cacheReadTokens * sonnet.cache_read +
        s.cost.cacheWriteTokens * sonnet.cache_5m_write) /
      1_000_000;
  }
  const wasted = opusCost - sonnetCost;
  if (wasted < 1) return [];

  const days = Math.max(1, Math.ceil((a.rangeEndMs - a.rangeStartMs) / 86_400_000));
  const monthly = wasted * (30 / days);

  return [
    {
      id: "model-overkill",
      severity: monthly > 50 ? "high" : "warn",
      title: `Opus is doing Sonnet-grade work in ${overkill.length} sessions`,
      body:
        `${overkill.length} Opus sessions had short outputs and no tool use — i.e. nothing that ` +
        `requires Opus's extra capability. Switching just these to Sonnet would have saved ` +
        `~$${wasted.toFixed(2)} (≈ $${monthly.toFixed(2)}/month at this rate). ` +
        `Use Opus for hard reasoning, Sonnet for everyday coding, Haiku for simple tasks. ` +
        `Set per-session model with /model in Claude Code.`,
      estimatedMonthlySavings: monthly,
      evidence: overkill
        .sort((x, y) => y.cost.totalCost - x.cost.totalCost)
        .slice(0, 5)
        .map((s) => ({
          sessionId: s.id,
          projectPath: s.projectPath,
          ts: s.startMs,
          note: `${s.turnCount} turns, ${s.cost.outputTokens} out tokens, $${s.cost.totalCost.toFixed(2)}`,
        })),
    },
  ];
};
