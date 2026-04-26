// `ccmeter merge` — combine analyses from multiple machines into one report.
// Useful for users with a laptop + workstation, or for team-level insight
// when individual exports are aggregated.

import fs from "node:fs/promises";
import { ANALYSIS_SCHEMA_VERSION, type Analysis, type Session } from "../../core/types.js";

interface MergeOpts {
  out?: string;
}

export async function runMerge(files: string[], opts: MergeOpts): Promise<void> {
  if (files.length === 0) throw new Error("provide at least one ccmeter export json file");
  const analyses: Analysis[] = [];
  for (const f of files) {
    const raw = await fs.readFile(f, "utf8");
    const parsed = JSON.parse(raw) as Analysis;
    // Reject incompatible majors so we never silently corrupt a merge.
    const v = parsed.schemaVersion ?? 0;
    if (v !== ANALYSIS_SCHEMA_VERSION) {
      throw new Error(
        `${f}: schemaVersion ${v} is incompatible with this ccmeter ` +
          `(expected ${ANALYSIS_SCHEMA_VERSION}). Re-export with a matching ccmeter version.`,
      );
    }
    analyses.push(parsed);
  }

  const sessions: Session[] = analyses.flatMap((a) => a.sessions);
  // dedupe by session id (last write wins; merge bust counts max)
  const seen = new Map<string, Session>();
  for (const s of sessions) {
    const prev = seen.get(s.id);
    if (!prev || s.cost.totalCost > prev.cost.totalCost) seen.set(s.id, s);
  }
  const dedup = [...seen.values()];

  const merged = {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    generatedAt: Date.now(),
    rangeStartMs: Math.min(...analyses.map((a) => a.rangeStartMs)),
    rangeEndMs: Math.max(...analyses.map((a) => a.rangeEndMs)),
    sessions: dedup,
    totals: {
      totalCost: dedup.reduce((acc, s) => acc + s.cost.totalCost, 0),
      sessions: dedup.length,
      turns: dedup.reduce((acc, s) => acc + s.turnCount, 0),
      busts: dedup.reduce((acc, s) => acc + s.cacheBusts.length, 0),
      bustCost: dedup.reduce(
        (acc, s) => acc + s.cacheBusts.reduce((a, b) => a + b.wastedCost, 0),
        0,
      ),
    },
    sources: files,
  };

  const body = JSON.stringify(merged, null, 2) + "\n";
  if (opts.out) {
    await fs.writeFile(opts.out, body);
    process.stderr.write(`wrote merged analysis (${dedup.length} sessions) to ${opts.out}\n`);
  } else {
    process.stdout.write(body);
  }
}
