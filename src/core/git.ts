// Best-effort git-branch detection for a directory.
//
// When a Claude Code session runs inside a git repo, we can read .git/HEAD
// to find the current branch and use it to auto-tag sessions like
// "branch:auth-refactor". This is purely passive — we never run git, we
// just read a single text file synchronously.

import fs from "node:fs";
import path from "node:path";

const cache = new Map<string, string | null>();

/** Returns the current branch for a working tree, or undefined if not a
 * git repo or we couldn't read HEAD. Heavily cached because most sessions
 * in a window come from the same handful of repos. */
export function inferBranch(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  const cached = cache.get(cwd);
  if (cached !== undefined) return cached ?? undefined;

  const branch = readBranch(cwd);
  cache.set(cwd, branch ?? null);
  return branch;
}

function readBranch(cwd: string): string | undefined {
  // Walk upward looking for .git (max 8 levels — fast bail).
  let dir = cwd;
  for (let i = 0; i < 8; i++) {
    const gitDir = path.join(dir, ".git");
    let stat;
    try {
      stat = fs.statSync(gitDir);
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return undefined;
      dir = parent;
      continue;
    }
    if (stat.isDirectory()) return readHeadFile(path.join(gitDir, "HEAD"));
    if (stat.isFile()) {
      // .git is a file — happens with worktrees. Contents: `gitdir: <path>`.
      try {
        const txt = fs.readFileSync(gitDir, "utf8").trim();
        const m = /^gitdir:\s*(.+)$/.exec(txt);
        if (m && m[1]) {
          const real = path.isAbsolute(m[1]) ? m[1] : path.join(dir, m[1]);
          return readHeadFile(path.join(real, "HEAD"));
        }
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
  return undefined;
}

function readHeadFile(headPath: string): string | undefined {
  try {
    const txt = fs.readFileSync(headPath, "utf8").trim();
    // Format: "ref: refs/heads/branch-name" OR a raw SHA (detached HEAD).
    const m = /^ref:\s*refs\/heads\/(.+)$/.exec(txt);
    if (m && m[1]) return m[1];
    // Detached HEAD — use the short SHA prefix.
    if (/^[0-9a-f]{7,}$/.test(txt)) return `sha:${txt.slice(0, 7)}`;
    return undefined;
  } catch {
    return undefined;
  }
}
