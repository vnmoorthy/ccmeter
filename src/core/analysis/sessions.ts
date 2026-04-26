// Group raw turns into Session objects.
// One JSONL file usually = one session, but some files contain multiple
// (resumed-then-forked) sessionIds. We bucket by (sessionId, filePath).

import path from "node:path";
import { addCost, costForTurn, emptyCost } from "../pricing/compute.js";
import {
  turnHasUsage,
  turnModel,
  turnProjectPath,
  turnSessionId,
  turnTimestampMs,
  type Turn,
} from "../jsonl/schema.js";
import { decodeProjectDirName } from "../paths.js";
import type { CacheBust, FileParseResult, Session, SessionShape } from "../types.js";
import { detectCacheBusts } from "./cache.js";

export interface SessionizeOptions {
  /** Drop sessions with no costed turns. Default true. */
  requireCost?: boolean;
}

export function sessionize(
  files: FileParseResult[],
  opts: SessionizeOptions = {},
): Session[] {
  const requireCost = opts.requireCost ?? true;
  const groups = new Map<string, { turns: Turn[]; filePath: string }>();

  for (const file of files) {
    let fallbackId = path.basename(file.filePath, ".jsonl");
    for (const turn of file.turns) {
      const sid = turnSessionId(turn, fallbackId);
      const key = `${sid}|${file.filePath}`;
      let g = groups.get(key);
      if (!g) {
        g = { turns: [], filePath: file.filePath };
        groups.set(key, g);
      }
      g.turns.push(turn);
    }
  }

  const sessions: Session[] = [];
  for (const [key, g] of groups) {
    const sid = key.split("|")[0]!;
    const session = buildSession(sid, g.turns, g.filePath);
    if (!session) continue;
    if (requireCost && session.cost.totalCost === 0 && session.cacheBusts.length === 0) {
      continue;
    }
    sessions.push(session);
  }
  sessions.sort((a, b) => b.startMs - a.startMs);
  return sessions;
}

function buildSession(id: string, turns: Turn[], filePath: string): Session | null {
  if (turns.length === 0) return null;

  // Sort by timestamp asc; turns with no timestamp keep their file order at the end.
  const stamped = turns.map((t) => ({ t, ts: turnTimestampMs(t) }));
  stamped.sort((a, b) => (a.ts ?? Infinity) - (b.ts ?? Infinity));

  let cost = emptyCost();
  let toolUseCount = 0;
  const modelCounts = new Map<string, number>();
  const toolCalls: Record<string, number> = {};
  const toolCost: Record<string, number> = {};
  let startMs = Infinity;
  let endMs = 0;
  let projectHint: string | undefined;
  let interactiveTurns = 0;
  let agenticTurns = 0;
  let prevTs: number | undefined;

  for (const { t, ts } of stamped) {
    const ph = turnProjectPath(t);
    if (ph && !projectHint) projectHint = ph;

    if (ts !== undefined) {
      if (ts < startMs) startMs = ts;
      if (ts > endMs) endMs = ts;
      if (prevTs !== undefined) {
        const gap = ts - prevTs;
        if (gap < 90_000) interactiveTurns += 1;
        else if (gap > 5 * 60_000) agenticTurns += 1;
      }
      prevTs = ts;
    }

    // Extract tool_use names from the message content (assistant turns only
    // contain tool_use blocks; user/result turns contain tool_result).
    const toolNames: string[] = [];
    if (Array.isArray(t.message?.content)) {
      for (const c of t.message?.content as unknown[]) {
        if (
          c &&
          typeof c === "object" &&
          (c as { type?: string }).type === "tool_use"
        ) {
          toolUseCount += 1;
          const nm = (c as { name?: unknown }).name;
          if (typeof nm === "string" && nm.length > 0) toolNames.push(nm);
        }
      }
    }

    if (turnHasUsage(t)) {
      const c = costForTurn(t);
      cost = addCost(cost, c);
      const m = c.model;
      modelCounts.set(m, (modelCounts.get(m) ?? 0) + 1);

      // Per-tool cost attribution: split this turn's *output + cache_write*
      // cost across the tool_use blocks in it. The remaining chunk (input,
      // cache_read) is overhead that's hard to attribute to a single tool.
      if (toolNames.length > 0) {
        const turnAttribCost = c.outputCost + c.cacheWriteCost;
        const perTool = turnAttribCost / toolNames.length;
        for (const name of toolNames) {
          toolCalls[name] = (toolCalls[name] ?? 0) + 1;
          toolCost[name] = (toolCost[name] ?? 0) + perTool;
        }
      }
    } else {
      const m = turnModel(t);
      if (m) modelCounts.set(m, (modelCounts.get(m) ?? 0) + 1);
      // Even no-cost turns may have tool_use blocks (rare but possible).
      for (const name of toolNames) {
        toolCalls[name] = (toolCalls[name] ?? 0) + 1;
      }
    }
  }

  if (!Number.isFinite(startMs)) startMs = endMs || Date.now();
  if (!endMs) endMs = startMs;

  const models = Array.from(modelCounts.keys());
  const primaryModel =
    [...modelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  const shape = classifyShape(interactiveTurns, agenticTurns, stamped.length, endMs - startMs);
  const projectPath = normalizeProjectPath(projectHint, filePath);
  const cacheBusts: CacheBust[] = detectCacheBusts(stamped.map(({ t, ts }) => ({ t, ts })), id);

  return {
    id,
    projectPath,
    startMs,
    endMs,
    durationMs: Math.max(0, endMs - startMs),
    models,
    primaryModel,
    turnCount: turns.length,
    toolUseCount,
    cost,
    cacheBusts,
    shape,
    filePath,
    toolCalls,
    toolCost,
  };
}

function classifyShape(
  interactive: number,
  agentic: number,
  total: number,
  durationMs: number,
): SessionShape {
  if (total <= 3 && durationMs < 60_000) return "burst";
  if (interactive > agentic * 3) return "interactive";
  if (agentic > interactive * 3) return "agentic";
  return "mixed";
}

function normalizeProjectPath(hint: string | undefined, filePath: string): string {
  if (hint) return hint;
  // ~/.claude/projects/<encoded>/<sessionId>.jsonl — decode the parent dir
  const parent = path.basename(path.dirname(filePath));
  return decodeProjectDirName(parent);
}
