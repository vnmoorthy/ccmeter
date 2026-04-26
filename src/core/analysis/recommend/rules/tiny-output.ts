// Many sessions with output_tokens < 50 — abandoned/cancelled prompts where
// the user paid the input price for nothing useful.

import type { Recommendation } from "../../../types.js";
import type { Rule } from "../index.js";

export const tinyOutputRule: Rule = (a) => {
  const tiny = a.sessions.filter((s) => s.cost.outputTokens < 50 && s.cost.inputTokens > 5_000);
  if (tiny.length < 4) return [];

  const wasted = tiny.reduce((acc, s) => acc + s.cost.inputCost + s.cost.cacheWriteCost, 0);
  if (wasted < 0.5) return [];

  const days = Math.max(1, Math.ceil((a.rangeEndMs - a.rangeStartMs) / 86_400_000));
  const monthly = wasted * (30 / days);

  return [
    {
      id: "tiny-output",
      severity: monthly > 15 ? "warn" : "info",
      title: `${tiny.length} sessions paid for input but produced almost nothing`,
      body:
        `Sessions where you loaded thousands of tokens of input but Claude produced fewer than ` +
        `50 tokens of output — usually a cancelled or aborted prompt. Total leak: $${wasted.toFixed(2)}. ` +
        `When you change your mind, hit Ctrl-C *before* sending, not after — pre-flight cancellation ` +
        `is free.`,
      estimatedMonthlySavings: monthly,
      evidence: tiny
        .sort((x, y) => y.cost.totalCost - x.cost.totalCost)
        .slice(0, 4)
        .map((s) => ({
          sessionId: s.id,
          projectPath: s.projectPath,
          ts: s.startMs,
          note: `${s.cost.inputTokens} in / ${s.cost.outputTokens} out`,
        })),
    },
  ];
};
