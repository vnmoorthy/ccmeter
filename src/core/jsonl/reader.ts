// Streaming JSONL parser.
//
// Parses one Claude Code session-log file at a time. Designed to be cheap on
// memory (line-by-line) and resilient to partial writes — the file may be
// actively appended to by a running Claude Code session.

import fs from "node:fs";
import readline from "node:readline";
import { log } from "../logger.js";
import type { FileParseResult, ParseError, ParseStats } from "../types.js";
import { turnSchema, type Turn } from "./schema.js";

export interface ReadOptions {
  /** Stop after parsing this many lines. Useful for sampling. */
  maxLines?: number;
}

export async function parseFile(
  filePath: string,
  fileKey: string,
  mtimeMs: number,
  sizeBytes: number,
  opts: ReadOptions = {},
): Promise<FileParseResult> {
  const startedAt = Date.now();
  const turns: Turn[] = [];
  const errors: ParseError[] = [];
  let lineNumber = 0;
  let validTurns = 0;
  let stream: fs.ReadStream | null = null;

  try {
    stream = fs.createReadStream(filePath, { encoding: "utf8", highWaterMark: 64 * 1024 });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const rawLine of rl) {
      lineNumber += 1;
      const line = rawLine.trim();
      if (!line) continue;
      if (opts.maxLines && lineNumber > opts.maxLines) break;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        errors.push({
          filePath,
          line: lineNumber,
          message: `JSON.parse: ${(err as Error).message}`,
        });
        continue;
      }

      const result = turnSchema.safeParse(parsed);
      if (!result.success) {
        errors.push({
          filePath,
          line: lineNumber,
          message: `schema: ${result.error.errors[0]?.message ?? "invalid"}`,
        });
        continue;
      }

      turns.push(result.data);
      validTurns += 1;
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    log.warn(`failed to read ${filePath}: ${e.message}`);
  } finally {
    stream?.destroy();
  }

  const stats: ParseStats = {
    totalLines: lineNumber,
    validTurns,
    errors: errors.length,
    durationMs: Date.now() - startedAt,
  };

  return {
    filePath,
    fileKey,
    mtimeMs,
    sizeBytes,
    turns,
    errors,
    stats,
  };
}

/**
 * Tail-read: read only the last N bytes of a file. Useful for `ccmeter watch`
 * which polls the most recent activity without re-parsing huge histories.
 */
export async function tailFile(filePath: string, lastBytes: number): Promise<Turn[]> {
  const turns: Turn[] = [];
  let fd: fs.promises.FileHandle | null = null;
  try {
    fd = await fs.promises.open(filePath, "r");
    const stat = await fd.stat();
    const start = Math.max(0, stat.size - lastBytes);
    const length = stat.size - start;
    const buf = Buffer.alloc(length);
    await fd.read(buf, 0, length, start);
    const text = buf.toString("utf8");
    const lines = text.split("\n");
    // If we started mid-line, drop the first partial line.
    if (start > 0 && lines.length > 0) lines.shift();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        const r = turnSchema.safeParse(obj);
        if (r.success) turns.push(r.data);
      } catch {
        // partial trailing line during active write — skip
      }
    }
  } catch {
    // file disappeared or unreadable — return what we have
  } finally {
    await fd?.close();
  }
  return turns;
}
