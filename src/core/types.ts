// Shared types used across the parser, pricing, analysis, and CLI/web layers.
// Keep this file lean: only types that cross module boundaries belong here.

import type { Turn } from "./jsonl/schema.js";

export interface Cost {
  inputCost: number;
  outputCost: number;
  cacheWriteCost: number; // sum across 5m + 1h
  cacheWrite5mCost: number;
  cacheWrite1hCost: number;
  cacheReadCost: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  model: string;
  cacheTier: "5m" | "1h" | "mixed" | "none";
}

export interface CostedTurn {
  turn: Turn;
  cost: Cost;
  /** Best-effort timestamp in ms since epoch. May be undefined for malformed turns. */
  ts: number | undefined;
  /** Hashed file path the turn came from (for grouping when sessionId is missing). */
  fileKey: string;
}

export type SessionShape = "interactive" | "agentic" | "mixed" | "burst";

export interface Session {
  id: string;
  projectPath: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  models: string[];
  primaryModel: string;
  turnCount: number;
  toolUseCount: number;
  cost: Cost;
  cacheBusts: CacheBust[];
  shape: SessionShape;
  filePath: string;
  /** Per-tool call counts within this session. Empty for non-agentic sessions. */
  toolCalls: Record<string, number>;
  /** Per-tool attributed cost — see analysis/tools.ts for the model. */
  toolCost: Record<string, number>;
  /** Optional user-applied tag (via `ccmeter tag`). */
  tag?: string;
}

export interface CacheBust {
  ts: number;
  tier: "5m" | "1h";
  gapSeconds: number;
  /** Cost of the cache-write turn (the bust itself). */
  writeCost: number;
  /** What an equivalent cache read would have cost. */
  hypotheticalReadCost: number;
  /** writeCost - hypotheticalReadCost. */
  wastedCost: number;
  sessionId: string;
}

export interface ParseError {
  filePath: string;
  line: number;
  message: string;
}

export interface ParseStats {
  totalLines: number;
  validTurns: number;
  errors: number;
  durationMs: number;
}

export interface FileParseResult {
  filePath: string;
  fileKey: string;
  mtimeMs: number;
  sizeBytes: number;
  turns: Turn[];
  errors: ParseError[];
  stats: ParseStats;
}

export interface DailyBucket {
  date: string; // YYYY-MM-DD in local TZ
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  busts: number;
  bustCost: number;
  sessions: number;
  turns: number;
}

export interface ProjectAggregate {
  projectPath: string;
  totalCost: number;
  sessions: number;
  turns: number;
  cacheHitRatio: number;
  bustCost: number;
}

export interface ModelAggregate {
  model: string;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  turns: number;
}

export interface ToolAggregate {
  /** Canonical tool name as it appears in tool_use blocks (e.g. "Bash", "Read"). */
  name: string;
  /** Total tool_use invocations across all turns in the window. */
  calls: number;
  /** Distinct session count where this tool fired at least once. */
  sessionsUsedIn: number;
  /** Sum of attributed dollar cost — see analysis/tools.ts for the model. */
  attributedCost: number;
  /** Average cost per call. */
  avgCostPerCall: number;
}

export interface Recommendation {
  id: string;
  severity: "info" | "warn" | "high";
  title: string;
  body: string;
  estimatedMonthlySavings: number;
  evidence: Array<{
    sessionId: string;
    projectPath: string;
    ts: number;
    note?: string;
  }>;
}

/** Bumped when the Analysis JSON shape changes incompatibly. Downstream
 * consumers (dashboards, custom rules, the GitHub Action template) should
 * read this and refuse mismatched majors. */
export const ANALYSIS_SCHEMA_VERSION = 1;

export interface Analysis {
  /** Always equal to ANALYSIS_SCHEMA_VERSION at the time the export was made. */
  schemaVersion: number;
  generatedAt: number;
  rangeStartMs: number;
  rangeEndMs: number;
  sessions: Session[];
  daily: DailyBucket[];
  byProject: ProjectAggregate[];
  byModel: ModelAggregate[];
  byTool: ToolAggregate[];
  totals: {
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    busts: number;
    bustCost: number;
    cacheHitRatio: number;
    sessions: number;
    turns: number;
  };
  parseStats: {
    files: number;
    bytes: number;
    turns: number;
    errors: number;
    cacheHits: number;
    cacheMisses: number;
    durationMs: number;
  };
  recommendations: Recommendation[];
}
