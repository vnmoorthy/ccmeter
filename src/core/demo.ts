// Synthetic dataset generator. Lets users `ccmeter --demo` even with no
// Claude Code installed, and gives the README/cast-gif consistent numbers.
//
// Generates ~6 weeks of plausible-looking sessions across 4 projects with a
// visible step-change at the early-March-2026 cache-TTL rollout so the cache
// page renders the callout.

import { ANALYSIS_SCHEMA_VERSION, type Analysis, type Session } from "./types.js";
import { runRecommendations } from "./analysis/recommend/index.js";

const NOW = Date.now();
const DAY = 86_400_000;
// Cache-TTL rollout boundary used in the demo dataset. The real rollout was
// staggered through early March 2026; we pick a single sharp date so the
// step-change is visible in `--demo` runs.
const TTL_ROLLOUT_DATE = new Date("2026-03-01T00:00:00").getTime();

const PROJECTS = [
  { path: "/Users/demo/work/monorepo-frontend", weight: 0.45 },
  { path: "/Users/demo/work/api-server", weight: 0.3 },
  { path: "/Users/demo/personal/side-project", weight: 0.15 },
  { path: "/Users/demo/scripts", weight: 0.1 },
];

const MODELS = [
  { id: "claude-sonnet-4-6", weight: 0.55, mult: 1.0 },
  { id: "claude-opus-4-7", weight: 0.25, mult: 4.5 },
  { id: "claude-haiku-4-5", weight: 0.2, mult: 0.3 },
];

function rng(seed: number): () => number {
  let x = seed | 0 || 1;
  return () => {
    x = (x * 1664525 + 1013904223) | 0;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function makeDemoAnalysis(seed = 42): Analysis {
  const rand = rng(seed);
  const sessions: Session[] = [];
  for (let day = 42; day >= 0; day--) {
    const dayMs = NOW - day * DAY;
    const isWeekend = [0, 6].includes(new Date(dayMs).getDay());
    const isPostTtlRollout = dayMs >= TTL_ROLLOUT_DATE;
    const sessionsThatDay = Math.floor(rand() * (isWeekend ? 3 : 8)) + 2;
    for (let i = 0; i < sessionsThatDay; i++) {
      const proj = pickWeighted(PROJECTS, rand)!;
      const model = pickWeighted(MODELS, rand)!;
      const startOffset = Math.floor(rand() * 10 * 3_600_000) + 9 * 3_600_000;
      const startMs = dayMs - dayMs % DAY + startOffset;
      const duration = Math.floor(rand() * 90 * 60_000) + 60_000;
      const turns = Math.max(1, Math.floor(rand() * 18) + 2);
      const inputTokens = Math.floor(rand() * 80_000) + 5_000;
      const outputTokens = Math.floor(rand() * 4_000) + 100;
      const cacheReadTokens = Math.floor(inputTokens * (isPostTtlRollout ? 0.4 : 0.7) * rand());
      const cacheWriteTokens = Math.floor(inputTokens * 0.3 * rand());
      const baseUnitCost = 3 * model.mult;
      const totalCost =
        (inputTokens / 1e6) * baseUnitCost +
        (outputTokens / 1e6) * baseUnitCost * 5 +
        (cacheReadTokens / 1e6) * baseUnitCost * 0.1 +
        (cacheWriteTokens / 1e6) * baseUnitCost * 1.25;
      // post-rollout: more busts
      const bustChance = isPostTtlRollout ? 0.35 : 0.07;
      const cacheBusts =
        rand() < bustChance
          ? Array.from({ length: Math.floor(rand() * 4) + 1 }, () => ({
              ts: startMs + Math.floor(rand() * duration),
              tier: "5m" as const,
              gapSeconds: 300 + Math.floor(rand() * 1200),
              writeCost: 0.05 + rand() * 0.15,
              hypotheticalReadCost: 0.005,
              wastedCost: 0.04 + rand() * 0.14,
              sessionId: `demo-${day}-${i}`,
            }))
          : [];
      // Synthetic per-tool distribution that mirrors what a typical Claude Code
      // user produces: Bash + Read + Edit dominate, then Glob/Grep, then Write.
      const tooluse = Math.floor(turns * (rand() * 1.5));
      const tcCalls: Record<string, number> = {};
      const tcCost: Record<string, number> = {};
      const toolDist: Array<[string, number]> = [
        ["Bash", 0.32],
        ["Read", 0.22],
        ["Edit", 0.18],
        ["Glob", 0.10],
        ["Grep", 0.08],
        ["Write", 0.04],
        ["WebFetch", 0.03],
        ["Agent", 0.03],
      ];
      let remaining = tooluse;
      const baseToolCost =
        ((outputTokens / 1e6) * baseUnitCost * 5 +
          (cacheWriteTokens / 1e6) * baseUnitCost * 1.25);
      for (const [name, share] of toolDist) {
        const n = Math.round(tooluse * share * (0.7 + rand() * 0.6));
        if (n > 0) {
          tcCalls[name] = n;
          tcCost[name] = baseToolCost * share * (0.7 + rand() * 0.6);
          remaining -= n;
        }
      }
      if (remaining > 0) tcCalls["Bash"] = (tcCalls["Bash"] ?? 0) + remaining;

      sessions.push({
        id: `demo-${day}-${i}`,
        projectPath: proj.path,
        startMs,
        endMs: startMs + duration,
        durationMs: duration,
        models: [model.id],
        primaryModel: model.id,
        turnCount: turns,
        toolUseCount: tooluse,
        toolCalls: tcCalls,
        toolCost: tcCost,
        cost: {
          inputCost: (inputTokens / 1e6) * baseUnitCost,
          outputCost: (outputTokens / 1e6) * baseUnitCost * 5,
          cacheWriteCost: (cacheWriteTokens / 1e6) * baseUnitCost * 1.25,
          cacheWrite5mCost: (cacheWriteTokens / 1e6) * baseUnitCost * 1.25,
          cacheWrite1hCost: 0,
          cacheReadCost: (cacheReadTokens / 1e6) * baseUnitCost * 0.1,
          totalCost,
          inputTokens,
          outputTokens,
          cacheWriteTokens,
          cacheReadTokens,
          model: model.id,
          cacheTier: "5m",
        },
        cacheBusts,
        shape: rand() < 0.25 ? "agentic" : "interactive",
        filePath: `/demo/${day}-${i}.jsonl`,
      });
    }
  }
  // bucket
  const dailyMap = new Map<string, { date: string; totalCost: number; busts: number; bustCost: number; sessions: number; turns: number; cacheReadTokens: number; cacheWriteTokens: number; inputTokens: number; outputTokens: number }>();
  for (const s of sessions) {
    const k = formatDay(s.startMs);
    const cur =
      dailyMap.get(k) ??
      {
        date: k,
        totalCost: 0,
        busts: 0,
        bustCost: 0,
        sessions: 0,
        turns: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    cur.totalCost += s.cost.totalCost;
    cur.busts += s.cacheBusts.length;
    cur.bustCost += s.cacheBusts.reduce((a, b) => a + b.wastedCost, 0);
    cur.sessions += 1;
    cur.turns += s.turnCount;
    cur.cacheReadTokens += s.cost.cacheReadTokens;
    cur.cacheWriteTokens += s.cost.cacheWriteTokens;
    cur.inputTokens += s.cost.inputTokens;
    cur.outputTokens += s.cost.outputTokens;
    dailyMap.set(k, cur);
  }
  const daily = [...dailyMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  const totals = {
    totalCost: sessions.reduce((a, s) => a + s.cost.totalCost, 0),
    inputTokens: sessions.reduce((a, s) => a + s.cost.inputTokens, 0),
    outputTokens: sessions.reduce((a, s) => a + s.cost.outputTokens, 0),
    cacheReadTokens: sessions.reduce((a, s) => a + s.cost.cacheReadTokens, 0),
    cacheWriteTokens: sessions.reduce((a, s) => a + s.cost.cacheWriteTokens, 0),
    busts: sessions.reduce((a, s) => a + s.cacheBusts.length, 0),
    bustCost: sessions.reduce(
      (a, s) => a + s.cacheBusts.reduce((x, b) => x + b.wastedCost, 0),
      0,
    ),
    cacheHitRatio: 0,
    sessions: sessions.length,
    turns: sessions.reduce((a, s) => a + s.turnCount, 0),
  };
  totals.cacheHitRatio = totals.cacheReadTokens / Math.max(1, totals.cacheReadTokens + totals.cacheWriteTokens);

  // by model + by project
  const byProject = PROJECTS.map((p) => {
    const ses = sessions.filter((s) => s.projectPath === p.path);
    const reads = ses.reduce((a, s) => a + s.cost.cacheReadTokens, 0);
    const writes = ses.reduce((a, s) => a + s.cost.cacheWriteTokens, 0);
    return {
      projectPath: p.path,
      totalCost: ses.reduce((a, s) => a + s.cost.totalCost, 0),
      sessions: ses.length,
      turns: ses.reduce((a, s) => a + s.turnCount, 0),
      cacheHitRatio: reads / Math.max(1, reads + writes),
      bustCost: ses.reduce((a, s) => a + s.cacheBusts.reduce((x, b) => x + b.wastedCost, 0), 0),
    };
  }).sort((a, b) => b.totalCost - a.totalCost);

  const byModel = MODELS.map((m) => {
    const ses = sessions.filter((s) => s.primaryModel === m.id);
    return {
      model: m.id,
      totalCost: ses.reduce((a, s) => a + s.cost.totalCost, 0),
      inputTokens: ses.reduce((a, s) => a + s.cost.inputTokens, 0),
      outputTokens: ses.reduce((a, s) => a + s.cost.outputTokens, 0),
      cacheReadTokens: ses.reduce((a, s) => a + s.cost.cacheReadTokens, 0),
      cacheWriteTokens: ses.reduce((a, s) => a + s.cost.cacheWriteTokens, 0),
      turns: ses.reduce((a, s) => a + s.turnCount, 0),
    };
  }).sort((a, b) => b.totalCost - a.totalCost);

  // by tool — sum each session's toolCalls/toolCost into a single rollup.
  const toolCalls = new Map<string, number>();
  const toolCost = new Map<string, number>();
  const toolSess = new Map<string, Set<string>>();
  for (const s of sessions) {
    for (const [name, n] of Object.entries(s.toolCalls)) {
      toolCalls.set(name, (toolCalls.get(name) ?? 0) + n);
      let set = toolSess.get(name);
      if (!set) {
        set = new Set();
        toolSess.set(name, set);
      }
      set.add(s.id);
    }
    for (const [name, c] of Object.entries(s.toolCost)) {
      toolCost.set(name, (toolCost.get(name) ?? 0) + c);
    }
  }
  const byTool = [...toolCalls.entries()]
    .map(([name, calls]) => {
      const cost = toolCost.get(name) ?? 0;
      return {
        name,
        calls,
        sessionsUsedIn: toolSess.get(name)?.size ?? 0,
        attributedCost: cost,
        avgCostPerCall: calls > 0 ? cost / calls : 0,
      };
    })
    .sort((a, b) => b.attributedCost - a.attributedCost);

  const partial: Omit<Analysis, "recommendations"> = {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    generatedAt: NOW,
    rangeStartMs: NOW - 42 * DAY,
    rangeEndMs: NOW,
    sessions,
    daily,
    byProject,
    byModel,
    byTool,
    totals,
    parseStats: {
      files: sessions.length,
      bytes: sessions.length * 12_000,
      turns: totals.turns,
      errors: 0,
      cacheHits: 0,
      cacheMisses: sessions.length,
      durationMs: 12,
    },
  };
  const recs = runRecommendations(partial);
  return { ...partial, recommendations: recs };
}

function pickWeighted<T extends { weight: number }>(arr: T[], rand: () => number): T | undefined {
  const total = arr.reduce((a, x) => a + x.weight, 0);
  let r = rand() * total;
  for (const x of arr) {
    r -= x.weight;
    if (r <= 0) return x;
  }
  return arr[arr.length - 1];
}

function formatDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
