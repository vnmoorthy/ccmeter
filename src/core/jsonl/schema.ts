// Zod schema for a single Claude Code session-log line.
//
// The JSONL file at ~/.claude/projects/<encoded>/<session>.jsonl is a stream
// of mixed message types: user turns, assistant responses, tool calls, tool
// results, system messages, and a few internal events. Field names and shapes
// have shifted across Claude Code releases, so this schema is intentionally
// lenient: every field is optional and unknown keys pass through untouched.
//
// What we actually need downstream:
//   - timestamp (any of several encodings)
//   - sessionId
//   - cwd / project path hint
//   - message.model
//   - message.usage.* token counts
//
// Anything we can't reliably parse is dropped quietly — never thrown.

import { z } from "zod";

const usageSchema = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
    cache_creation: z
      .object({
        ephemeral_5m_input_tokens: z.number().optional(),
        ephemeral_1h_input_tokens: z.number().optional(),
      })
      .passthrough()
      .optional(),
    server_tool_use: z.unknown().optional(),
    service_tier: z.string().optional(),
  })
  .passthrough();

const messageSchema = z
  .object({
    id: z.string().optional(),
    type: z.string().optional(),
    role: z.string().optional(),
    model: z.string().optional(),
    content: z.unknown().optional(),
    usage: usageSchema.optional(),
    stop_reason: z.string().nullish(),
  })
  .passthrough();

export const turnSchema = z
  .object({
    type: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    sessionId: z.string().optional(),
    uuid: z.string().optional(),
    parentUuid: z.string().nullish(),
    cwd: z.string().optional(),
    projectPath: z.string().optional(),
    version: z.string().optional(),
    requestId: z.string().optional(),
    isMeta: z.boolean().optional(),
    isSidechain: z.boolean().optional(),
    isApiErrorMessage: z.boolean().optional(),
    message: messageSchema.optional(),
    toolUseResult: z.unknown().optional(),
    summary: z.string().optional(),
    leafUuid: z.string().optional(),
    gitBranch: z.string().optional(),
    userType: z.string().optional(),
  })
  .passthrough();

export type Turn = z.infer<typeof turnSchema>;
export type Usage = z.infer<typeof usageSchema>;
export type Message = z.infer<typeof messageSchema>;

/** Returns ms-since-epoch for a turn, or undefined if no usable timestamp. */
export function turnTimestampMs(turn: Turn): number | undefined {
  const ts = turn.timestamp;
  if (typeof ts === "number") {
    // accept seconds or millis
    return ts > 1e12 ? ts : ts * 1000;
  }
  if (typeof ts === "string") {
    const n = Date.parse(ts);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Best-effort sessionId for a turn. Falls back to uuid prefix if needed. */
export function turnSessionId(turn: Turn, fallback: string): string {
  if (turn.sessionId) return turn.sessionId;
  if (turn.uuid) return turn.uuid.split("-")[0] ?? fallback;
  return fallback;
}

/** Returns the usage object regardless of where Claude Code put it. */
export function turnUsage(turn: Turn): Usage | undefined {
  // Canonical: turn.message.usage
  const m = turn.message?.usage;
  if (m) return m;
  // Some older Claude Code versions and some non-Claude-Code Anthropic
  // tooling write `usage` at the top level of the turn. Be tolerant.
  const top = (turn as { usage?: unknown }).usage;
  if (top && typeof top === "object") return top as Usage;
  return undefined;
}

/** Returns true if this turn has any usage tokens worth costing. */
export function turnHasUsage(turn: Turn): boolean {
  const u = turnUsage(turn);
  if (!u) return false;
  return Boolean(
    (u.input_tokens && u.input_tokens > 0) ||
      (u.output_tokens && u.output_tokens > 0) ||
      (u.cache_creation_input_tokens && u.cache_creation_input_tokens > 0) ||
      (u.cache_read_input_tokens && u.cache_read_input_tokens > 0),
  );
}

/** Returns the model id used for this turn, normalized lowercase. */
export function turnModel(turn: Turn): string | undefined {
  // Canonical location.
  const m = turn.message?.model;
  if (typeof m === "string" && m.length > 0) return m.toLowerCase();
  // Top-level fallback observed in some Claude Code subagent traces.
  const t = (turn as { model?: unknown }).model;
  if (typeof t === "string" && t.length > 0) return t.toLowerCase();
  return undefined;
}

/** Best-effort project-path inference. Prefers cwd, falls back to projectPath. */
export function turnProjectPath(turn: Turn): string | undefined {
  return turn.cwd || turn.projectPath || undefined;
}
