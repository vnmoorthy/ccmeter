// The single end-to-end function every command starts from.
// load → sessionize → aggregate → recommend → return Analysis.

import { loadAll, type LoadOptions } from "./loader.js";
import { sessionize } from "./analysis/sessions.js";
import {
  aggregateByModel,
  aggregateByProject,
  bucketByDay,
  fillDailyGaps,
} from "./analysis/trends.js";
import { aggregateByTool } from "./analysis/tools.js";
import { applyTags } from "./tags.js";
import { runRecommendations } from "./analysis/recommend/index.js";
import { loadOverrides } from "./pricing/models.js";
import { ANALYSIS_SCHEMA_VERSION, type Analysis, type Session } from "./types.js";
import { makeDemoAnalysis } from "./demo.js";
import { displayAnonymizeId, displayAnonymizePath } from "./privacy.js";
import { inferBranch } from "./git.js";

export interface AnalyzeOptions extends LoadOptions {
  /** Filter sessions to those whose project path contains this substring. */
  projectFilter?: string;
  /** Only include sessions started in the last N days. */
  days?: number;
  /** Pad daily buckets with zero-rows for days with no activity. */
  fillGaps?: boolean;
  /** Return synthetic data — useful for first-run UX when no logs exist. */
  demo?: boolean;
  /** Replace project paths and session ids with stable anonymized labels.
   * Costs and trends are unchanged. Set this when sharing a screenshot or
   * launch gif. Honored automatically when CCMETER_ANONYMIZE=1 in env. */
  anonymize?: boolean;
  /** When true, sessions whose project path is a git working tree get an
   * auto-tag like "branch:auth-refactor" (skipped on main/master).
   * Auto-tag never overrides a manually-set tag. Honored automatically when
   * CCMETER_GIT_AUTOTAG=1 in env. */
  autoTagGit?: boolean;
}

/** Rewrite session.projectPath, session.id, session.filePath, and the
 * sessionId on every CacheBust into stable anonymized labels. Mutates in
 * place so the existing aggregation pipelines pick up the new values. */
function anonymizeSessions(sessions: Session[]): void {
  const projectMap = new Map<string, string>();
  for (const s of sessions) {
    if (!projectMap.has(s.projectPath)) {
      projectMap.set(s.projectPath, displayAnonymizePath(s.projectPath));
    }
    s.projectPath = projectMap.get(s.projectPath)!;
    const newId = displayAnonymizeId(s.id);
    for (const b of s.cacheBusts) b.sessionId = newId;
    s.id = newId;
    s.filePath = `~/projects/<anon>/${newId}.jsonl`;
  }
}

/** Demo data already comes pre-baked; rewrite labels post-hoc when the user
 * is recording a synthetic-data demo with --anonymize. Also rewrites the
 * derived byProject + recommendation-evidence labels so those tables match. */
function anonymizeAnalysis(a: Analysis): Analysis {
  anonymizeSessions(a.sessions);
  a.byProject = a.byProject.map((p) => ({
    ...p,
    projectPath: displayAnonymizePath(p.projectPath),
  }));
  a.recommendations = a.recommendations.map((r) => ({
    ...r,
    evidence: r.evidence.map((e) => ({
      ...e,
      sessionId: displayAnonymizeId(e.sessionId),
      projectPath: displayAnonymizePath(e.projectPath),
    })),
  }));
  return a;
}

export async function analyze(opts: AnalyzeOptions = {}): Promise<Analysis> {
  const anonymize = opts.anonymize || process.env.CCMETER_ANONYMIZE === "1";
  if (opts.demo || process.env.CCMETER_DEMO === "1") {
    const demo = makeDemoAnalysis();
    return anonymize ? anonymizeAnalysis(demo) : demo;
  }
  await loadOverrides();
  const days = opts.days ?? 30;
  const sinceMs = Date.now() - days * 86_400_000;
  const load = await loadAll({ ...opts, sinceMs });

  let sessions: Session[] = sessionize(load.results);
  // filter by date strictly (file mtime can include older sessions)
  sessions = sessions.filter((s) => s.endMs >= sinceMs);
  if (opts.projectFilter) {
    const f = opts.projectFilter.toLowerCase();
    sessions = sessions.filter((s) => s.projectPath.toLowerCase().includes(f));
  }

  // Apply persisted tags from ~/.config/ccmeter/tags.json (best-effort).
  await applyTags(sessions);

  // Optional: infer a tag from the git branch the session ran in.
  // Manual tags always win.
  const autoTagGit = opts.autoTagGit || process.env.CCMETER_GIT_AUTOTAG === "1";
  if (autoTagGit) {
    for (const s of sessions) {
      if (s.tag) continue;
      const branch = inferBranch(s.projectPath);
      if (!branch) continue;
      if (branch === "main" || branch === "master") continue;
      s.tag = `branch:${branch}`;
    }
  }

  // Anonymize BEFORE aggregation so every downstream consumer (CLI tables,
  // dashboard, recommendation evidence, JSON exports) inherits stable labels
  // automatically. (See anonymizeSessions below.)
  if (anonymize) anonymizeSessions(sessions);

  const dailyRaw = bucketByDay(sessions);
  const daily = opts.fillGaps !== false ? fillDailyGaps(dailyRaw) : dailyRaw;
  const byProject = aggregateByProject(sessions);
  const byModel = aggregateByModel(sessions);
  const byTool = aggregateByTool(sessions);

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
  const denom = totals.cacheReadTokens + totals.cacheWriteTokens;
  totals.cacheHitRatio = denom === 0 ? 0 : totals.cacheReadTokens / denom;

  const partial: Omit<Analysis, "recommendations"> = {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    generatedAt: Date.now(),
    rangeStartMs: sinceMs,
    rangeEndMs: Date.now(),
    sessions,
    daily,
    byProject,
    byModel,
    byTool,
    totals,
    parseStats: {
      files: load.stats.files,
      bytes: load.stats.bytes,
      turns: load.results.reduce((a, r) => a + r.turns.length, 0),
      errors: load.stats.errors,
      cacheHits: load.stats.cacheHits,
      cacheMisses: load.stats.cacheMisses,
      durationMs: load.stats.durationMs,
    },
  };

  const recommendations = runRecommendations(partial);
  return { ...partial, recommendations };
}
