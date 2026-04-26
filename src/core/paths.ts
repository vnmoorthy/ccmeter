// Cross-platform location of the Claude Code session-log directory.
//
// Default: ~/.claude/projects on every OS Claude Code currently ships on.
// Override with CCMETER_LOG_DIR (env var) or `--log-dir` (CLI flag).

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface SessionFile {
  path: string;
  size: number;
  mtimeMs: number;
}

export function getDefaultLogDir(): string {
  const override = process.env.CCMETER_LOG_DIR;
  if (override && override.trim().length > 0) return path.resolve(override);
  return path.join(os.homedir(), ".claude", "projects");
}

export function getCacheDir(): string {
  const override = process.env.CCMETER_CACHE_DIR;
  if (override && override.trim().length > 0) return path.resolve(override);
  return path.join(os.homedir(), ".cache", "ccmeter");
}

export function getConfigDir(): string {
  const override = process.env.CCMETER_CONFIG_DIR;
  if (override && override.trim().length > 0) return path.resolve(override);
  return path.join(os.homedir(), ".config", "ccmeter");
}

/** Recursively collects every session *.jsonl under `dir`.
 *
 * We intentionally skip:
 *   - history.jsonl (~/.claude global index, different shape)
 *   - summary-*.jsonl (per-conversation summaries, also different shape)
 *   - sessions-index.json (Claude Code's own session metadata index)
 * If Claude Code starts writing to a new naming convention we don't recognize
 * the lenient parser still won't crash; selftest will surface it.
 */
export async function findSessionFiles(dir: string): Promise<SessionFile[]> {
  const out: SessionFile[] = [];
  await walk(dir, out);
  // Newest first — most users want recent activity prioritized.
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

function isSessionLogFile(basename: string): boolean {
  if (!basename.endsWith(".jsonl")) return false;
  if (basename === "history.jsonl") return false;
  if (basename.startsWith("summary-")) return false;
  if (basename.startsWith("summary.")) return false;
  return true;
}

async function walk(current: string, out: SessionFile[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return;
    throw err;
  }
  for (const entry of entries) {
    const p = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(p, out);
    } else if (entry.isFile() && isSessionLogFile(entry.name)) {
      try {
        const stat = await fs.stat(p);
        out.push({ path: p, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch {
        // file vanished mid-scan — skip
      }
    }
  }
}

/**
 * Decode a Claude-Code-encoded project directory name back to its original
 * path. Best-effort heuristic — only used when no turn in the file carries a
 * `cwd` field (which is the actual source of truth).
 *
 * Encodings we handle:
 *   `-Users-moorthy-Projects-x`  → `/Users/moorthy/Projects/x`   (POSIX)
 *   `C--Users-moorthy-Projects-x` → `C:\Users\moorthy\Projects\x` (Windows drive)
 */
export function decodeProjectDirName(name: string): string {
  // Windows-drive heuristic: single uppercase/lowercase letter + double dash.
  const winMatch = /^([A-Za-z])--(.+)$/.exec(name);
  if (winMatch) {
    return `${winMatch[1]}:\\${(winMatch[2] ?? "").replace(/-/g, "\\")}`;
  }
  // POSIX absolute path encoding.
  if (name.startsWith("-")) return name.replace(/-/g, "/");
  return name;
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}
