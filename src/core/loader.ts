// High-level loader: discover files, read-through cache, parse misses,
// return a flat list of FileParseResults. Every command starts here.

import { findSessionFiles, getDefaultLogDir } from "./paths.js";
import { fileKeyFor, readCached, writeCached } from "./cache/store.js";
import { parseFile } from "./jsonl/reader.js";
import type { FileParseResult } from "./types.js";
import { log } from "./logger.js";

export interface LoadResult {
  results: FileParseResult[];
  stats: {
    files: number;
    bytes: number;
    cacheHits: number;
    cacheMisses: number;
    durationMs: number;
    errors: number;
  };
}

export interface LoadOptions {
  /** Override log directory. Defaults to env CCMETER_LOG_DIR or ~/.claude/projects. */
  logDir?: string;
  /** Only consider files modified within this many ms (cheap pre-filter). */
  sinceMs?: number;
  /** Don't read cache. Forces re-parse. */
  noCache?: boolean;
  /** Don't write cache. Useful for ephemeral dev runs. */
  readOnly?: boolean;
}

export async function loadAll(opts: LoadOptions = {}): Promise<LoadResult> {
  const startedAt = Date.now();
  const dir = opts.logDir || getDefaultLogDir();
  const files = await findSessionFiles(dir);

  const filtered = opts.sinceMs
    ? files.filter((f) => f.mtimeMs >= (opts.sinceMs as number))
    : files;

  const results: FileParseResult[] = [];
  let bytes = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  let errors = 0;

  // Parallelism cap: most users have a few hundred files, so 8 in flight is fine.
  const concurrency = Math.min(8, Math.max(1, filtered.length));
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= filtered.length) return;
      const f = filtered[i];
      if (!f) return;
      bytes += f.size;
      const key = fileKeyFor(f.path, f.mtimeMs, f.size);
      let result: FileParseResult | null = null;
      if (!opts.noCache) {
        result = await readCached(f.path, f.mtimeMs, f.size);
        if (result) cacheHits += 1;
      }
      if (!result) {
        cacheMisses += 1;
        result = await parseFile(f.path, key, f.mtimeMs, f.size);
        if (!opts.readOnly && result.turns.length > 0) {
          await writeCached(result);
        }
      }
      errors += result.errors.length;
      results.push(result);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  log.debug(
    `loaded ${results.length} files (${cacheHits} cached, ${cacheMisses} parsed) in ${
      Date.now() - startedAt
    }ms`,
  );

  return {
    results,
    stats: {
      files: filtered.length,
      bytes,
      cacheHits,
      cacheMisses,
      durationMs: Date.now() - startedAt,
      errors,
    },
  };
}
