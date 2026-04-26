// One project dominating spend. Sometimes intentional (your main job),
// sometimes a sign of stuck loops or runaway agentic sessions.

import type { Recommendation } from "../../../types.js";
import type { Rule } from "../index.js";

export const hotProjectRule: Rule = (a) => {
  if (a.byProject.length < 3) return [];
  const total = a.totals.totalCost;
  if (total < 5) return [];
  const top = a.byProject[0]!;
  const share = top.totalCost / total;
  if (share < 0.5) return [];

  const days = Math.max(1, Math.ceil((a.rangeEndMs - a.rangeStartMs) / 86_400_000));
  const monthly = top.totalCost * (30 / days);

  // Identify that project's worst sessions for evidence
  const projectSessions = a.sessions
    .filter((s) => s.projectPath === top.projectPath)
    .sort((x, y) => y.cost.totalCost - x.cost.totalCost)
    .slice(0, 5);

  return [
    {
      id: "hot-project",
      severity: share > 0.7 ? "warn" : "info",
      title: `${pretty(top.projectPath)} = ${(share * 100).toFixed(0)}% of your spend`,
      body:
        `One project accounts for ${(share * 100).toFixed(0)}% of your costs ` +
        `($${top.totalCost.toFixed(2)} of $${total.toFixed(2)} over the lookback window, ` +
        `~$${monthly.toFixed(2)}/month). If that's your main work, no action needed — ` +
        `you can also slice into it with \`ccmeter sessions --project ${shellQuote(top.projectPath)}\` ` +
        `to see what's costing the most inside it.`,
      estimatedMonthlySavings: 0, // informational
      evidence: projectSessions.map((s) => ({
        sessionId: s.id,
        projectPath: s.projectPath,
        ts: s.startMs,
        note: `$${s.cost.totalCost.toFixed(2)} — ${s.shape}`,
      })),
    },
  ];
};

function pretty(p: string): string {
  if (!p) return "(unknown project)";
  const parts = p.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || p;
}

function shellQuote(s: string): string {
  return /[\s"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}
