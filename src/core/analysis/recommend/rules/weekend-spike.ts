// Weekend spikes that look like "I let an agent run while I was out". Same
// nudge as after-hours but from a different angle.

import type { Recommendation } from "../../../types.js";
import type { Rule } from "../index.js";

export const weekendSpikeRule: Rule = (a) => {
  if (a.daily.length < 7) return [];
  const weekendCost = a.daily
    .filter((d) => {
      const dow = new Date(d.date + "T00:00:00").getDay();
      return dow === 0 || dow === 6;
    })
    .reduce((a, b) => a + b.totalCost, 0);
  const total = a.daily.reduce((a, b) => a + b.totalCost, 0);
  if (total < 20) return [];
  const ratio = weekendCost / total;
  if (ratio < 0.4) return [];

  return [
    {
      id: "weekend-spike",
      severity: "info",
      title: `Weekends: ${(ratio * 100).toFixed(0)}% of weekly spend`,
      body:
        `Your weekend spend (${(ratio * 100).toFixed(0)}% of total) is disproportionate to ` +
        `weekend days (29% of the week). If you're not actively coding on weekends, you may ` +
        `have an agent left running. Use \`ccmeter sessions --days 14\` to inspect.`,
      estimatedMonthlySavings: 0,
      evidence: [],
    },
  ];
};
