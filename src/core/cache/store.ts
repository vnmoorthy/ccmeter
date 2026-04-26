// Parsed-result cache.
//
// Parsing JSONL is fast (~30 MB/s), but on machines with hundreds of files
// it adds up. We persist parsed turns to ~/.cache/ccmeter/parsed/<key>.json.gz
// keyed by (path, mtime, size). Any change to the source file invalidates.
//
// Format note: we serialize only the trimmed turn shape we actually use,
// not the entire raw JSON, so a 50 MB JSONL caches into ~2-5 MB gzipped.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { ensureDir, getCacheDir } from "../paths.js";
import { log } from "../logger.js";
import type { FileParseResult } from "../types.js";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

interface CachedShape {
  v: 1;
  filePath: string;
  fileKey: string;
  mtimeMs: number;
  sizeBytes: number;
  parsedAt: number;
  turns: unknown[];
  stats: FileParseResult["stats"];
}

export function fileKeyFor(filePath: string, mtimeMs: number, sizeBytes: number): string {
  const h = crypto.createHash("sha1");
  h.update(filePath);
  h.update("|");
  h.update(String(Math.floor(mtimeMs)));
  h.update("|");
  h.update(String(sizeBytes));
  return h.digest("hex").slice(0, 16);
}

function pathFor(key: string): string {
  return path.join(getCacheDir(), "parsed", `${key}.json.gz`);
}

export async function readCached(
  filePath: string,
  mtimeMs: number,
  sizeBytes: number,
): Promise<FileParseResult | null> {
  const key = fileKeyFor(filePath, mtimeMs, sizeBytes);
  const cachePath = pathFor(key);
  try {
    const raw = await fs.readFile(cachePath);
    const json = (await gunzip(raw)).toString("utf8");
    const data = JSON.parse(json) as CachedShape;
    if (data.v !== 1) return null;
    if (data.filePath !== filePath || data.mtimeMs !== mtimeMs || data.sizeBytes !== sizeBytes) {
      return null;
    }
    return {
      filePath,
      fileKey: key,
      mtimeMs,
      sizeBytes,
      // turns are stored as plain JSON; downstream consumers treat them as Turn-shaped
      turns: data.turns as FileParseResult["turns"],
      errors: [],
      stats: data.stats,
    };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") log.debug(`cache read miss ${cachePath}: ${e.message}`);
    return null;
  }
}

export async function writeCached(result: FileParseResult): Promise<void> {
  const key = result.fileKey;
  const cachePath = pathFor(key);
  await ensureDir(path.dirname(cachePath));
  const payload: CachedShape = {
    v: 1,
    filePath: result.filePath,
    fileKey: key,
    mtimeMs: result.mtimeMs,
    sizeBytes: result.sizeBytes,
    parsedAt: Date.now(),
    turns: result.turns as unknown[],
    stats: result.stats,
  };
  try {
    const buf = await gzip(Buffer.from(JSON.stringify(payload)));
    await fs.writeFile(cachePath, buf);
  } catch (err) {
    log.warn(`cache write failed ${cachePath}: ${(err as Error).message}`);
  }
}

export async function clearCache(): Promise<{ removed: number; bytes: number }> {
  const dir = path.join(getCacheDir(), "parsed");
  let removed = 0;
  let bytes = 0;
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { removed, bytes };
  }
  for (const e of entries) {
    const p = path.join(dir, e);
    try {
      const stat = await fs.stat(p);
      bytes += stat.size;
      await fs.unlink(p);
      removed += 1;
    } catch {
      /* ignore */
    }
  }
  return { removed, bytes };
}

export async function cacheStats(): Promise<{ files: number; bytes: number; dir: string }> {
  const dir = path.join(getCacheDir(), "parsed");
  let files = 0;
  let bytes = 0;
  try {
    const entries = await fs.readdir(dir);
    for (const e of entries) {
      try {
        const s = await fs.stat(path.join(dir, e));
        files += 1;
        bytes += s.size;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* dir doesn't exist */
  }
  return { files, bytes, dir };
}
