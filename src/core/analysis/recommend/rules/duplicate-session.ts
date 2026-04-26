// Multiple sessions started within a short window in the same project — each
// one re-pays the full input price for context the previous session had cached.

import type { Recommendation } from "../../../types.js";
import type { Rule } from "../index.js";

const NEAR_GAP_MS = 30 * 60 * 1000; // 30 min

export const duplicateSessionRule: Rule = (a) => {
  // group sessions by project, walk them in time order, count clusters
  const byProj = new Map<string, typeof a.sessions>();
  for (const s of a.sessions) {
    const arr = byProj.get(s.projectPath) ?? [];
    arr.push(s);
    byProj.set(s.projectPath, arr);
  }

  const clusters: Array<{ project: string; sessions: typeof a.sessions; wasted: number }> = [];
  for (const [proj, arr] of byProj) {
    arr.sort((x, y) => x.startMs - y.startMs);
    let cluster: typeof a.sessions = [];
    for (const s of arr) {
      const last = cluster[cluster.length - 1];
      if (last && s.startMs - last.endMs < NEAR_GAP_MS) {
        cluster.push(s);
      } else {
        if (cluster.length >= 2) {
          // each restart after the first paid roughly the avg input cost again
          const avgInput = cluster.reduce((a, x) => a + x.cost.inputCost, 0) / cluster.length;
          const wasted = avgInput * (cluster.length - 1);
          clusters.push({ project: proj, sessions: [...cluster], wasted });
        }
        cluster = [s];
      }
    }
    if (cluster.length >= 2) {
      const avgInput = cluster.reduce((a, x) => a + x.cost.inputCost, 0) / cluster.length;
      clusters.push({
        project: proj,
        sessions: [...cluster],
        wasted: avgInput * (cluster.length - 1),
      });
    }
  }

  if (clusters.length === 0) return [];
  const totalWasted = clusters.reduce((a, c) => a + c.wasted, 0);
  if (totalWasted < 0.5) return [];

  const days = Math.max(1, Math.ceil((a.rangeEndMs - a.rangeStartMs) / 86_400_000));
  const monthly = totalWasted * (30 / days);

  return [
    {
      id: "duplicate-session",
      severity: monthly > 20 ? "warn" : "info",
      title: `${clusters.length} clusters of restart-heavy sessions`,
      body:
        `You restarted Claude Code in the same project shortly after a previous session ended ` +
        `${clusters.length} times. Each restart re-paid ~$${(totalWasted / Math.max(1, clusters.length)).toFixed(2)} ` +
        `for context that had just been cached. Consider \`/resume\` or keeping one long session ` +
        `with \`/compact\` instead of starting fresh.`,
      estimatedMonthlySavings: monthly,
      evidence: clusters.slice(0, 4).flatMap((c) =>
        c.sessions.slice(0, 2).map((s) => ({
          sessionId: s.id,
          projectPath: c.project,
          ts: s.startMs,
          note: `cluster of ${c.sessions.length}, est. wasted $${c.wasted.toFixed(2)}`,
        })),
      ),
    },
  ];
};
