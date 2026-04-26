// `ccmeter live` — full-screen ANSI dashboard that ticks each new turn live.
//
// Why a separate command from `watch`: `watch` is a one-line ticker for shell
// prompts and tmux. `live` is a full-screen experience that's worth taking a
// gif of — perfect for the README hero. It also surfaces today's running
// cost, today's busts, and the last few turns as they land.
//
// Implementation notes:
//   - Uses the same incremental file-tail approach as `watch`.
//   - No deps beyond what we already ship (no ink, no blessed). Plain ANSI.
//   - Quits cleanly on Ctrl-C, restoring the cursor and cleared screen.

import path from "node:path";
import fs from "node:fs/promises";
import pc from "picocolors";
import { findSessionFiles, getDefaultLogDir, type SessionFile } from "../../core/paths.js";
import { tailFile } from "../../core/jsonl/reader.js";
import { costForTurn } from "../../core/pricing/compute.js";
import { turnHasUsage, turnTimestampMs, turnModel, type Turn } from "../../core/jsonl/schema.js";
import { fmtUSD } from "../ui/format.js";

const { dim, bold, green, yellow, cyan, red } = pc;

interface Tick {
  ts: number;
  model: string;
  cost: number;
  filePath: string;
  toolNames: string[];
}

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR = "\x1b[2J\x1b[H";

export interface LiveOptions {
  interval?: string;
}

export async function runLive(opts: LiveOptions): Promise<void> {
  if (process.env.CCMETER_DEMO === "1") {
    return runDemoLive();
  }
  const interval = Math.max(500, parseInt(opts.interval ?? "1500", 10));
  const dir = getDefaultLogDir();

  process.stdout.write(HIDE_CURSOR + CLEAR);
  process.on("SIGINT", () => {
    process.stdout.write(SHOW_CURSOR + "\n");
    process.exit(0);
  });

  // Track per-file end offset so we only ingest new content each tick.
  const offsets = new Map<string, number>();
  const recent: Tick[] = [];
  let totalToday = 0;
  let bustsToday = 0;
  const startMs = startOfDay();

  // Pre-seed by reading today's tail of every file once so the screen isn't
  // empty on the first tick.
  try {
    const files = await findSessionFiles(dir);
    for (const f of files.slice(0, 50)) {
      offsets.set(f.path, f.size);
    }
  } catch {
    /* dir missing — show empty state */
  }

  const tick = async (): Promise<void> => {
    let files: SessionFile[];
    try {
      files = await findSessionFiles(dir);
    } catch {
      files = [];
    }

    for (const f of files) {
      const prev = offsets.get(f.path) ?? 0;
      if (f.size <= prev) {
        offsets.set(f.path, f.size);
        continue;
      }
      const delta = f.size - prev;
      const turns = await tailFile(f.path, Math.min(delta + 4096, 256_000));
      offsets.set(f.path, f.size);
      for (const t of turns) {
        const ts = turnTimestampMs(t);
        if (ts === undefined) continue;
        if (ts < startMs) continue;
        if (!turnHasUsage(t)) continue;
        const c = costForTurn(t);
        if (c.totalCost === 0) continue;
        const tools = extractToolNames(t);
        const tk: Tick = {
          ts,
          model: turnModel(t) ?? "unknown",
          cost: c.totalCost,
          filePath: f.path,
          toolNames: tools,
        };
        recent.push(tk);
        totalToday += c.totalCost;
      }
    }
    while (recent.length > 12) recent.shift();
    render(recent, totalToday, bustsToday, dir);
  };

  await tick();
  const handle = setInterval(() => {
    tick().catch((err) => {
      process.stderr.write(red(`live tick: ${(err as Error).message}\n`));
    });
  }, interval);
  void handle; // keep alive
  // Block forever — Ctrl-C exits.
  await new Promise(() => {});
}

function render(recent: Tick[], totalToday: number, _bustsToday: number, dir: string): void {
  const W = process.stdout.columns ?? 100;
  const lines: string[] = [];
  lines.push(CLEAR);
  lines.push(
    cyan("ccmeter live") +
      "  " +
      dim(new Date().toLocaleTimeString() + " · " + dir),
  );
  lines.push("─".repeat(Math.min(W, 100)));
  lines.push(
    `  ${bold("today")}     ${fmtUSD(totalToday)}    ${dim("(updates as Claude Code writes)")}`,
  );
  lines.push("");
  lines.push(dim("  recent turns"));
  if (recent.length === 0) {
    lines.push("    " + dim("waiting for the next assistant turn…"));
  } else {
    for (const r of recent.slice(-10)) {
      const time = new Date(r.ts).toLocaleTimeString();
      const tools = r.toolNames.length > 0 ? dim(`  [${r.toolNames.join(",")}]`) : "";
      const costColor =
        r.cost >= 0.5 ? red : r.cost >= 0.1 ? yellow : green;
      lines.push(
        `    ${dim(time)}  ${costColor(fmtUSD(r.cost).padStart(7))}  ${dim(short(r.model))}${tools}`,
      );
    }
  }
  lines.push("");
  lines.push(dim("  Ctrl-C to exit"));
  process.stdout.write(lines.join("\n"));
}

function short(model: string): string {
  return model.replace(/^claude-/, "");
}

function extractToolNames(t: Turn): string[] {
  if (!Array.isArray(t.message?.content)) return [];
  const out: string[] = [];
  for (const c of t.message?.content as unknown[]) {
    if (c && typeof c === "object" && (c as { type?: string }).type === "tool_use") {
      const nm = (c as { name?: unknown }).name;
      if (typeof nm === "string") out.push(nm);
    }
  }
  return out;
}

function startOfDay(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Demo mode: replay synthetic turns so people without Claude Code can record a gif. */
async function runDemoLive(): Promise<void> {
  process.stdout.write(HIDE_CURSOR + CLEAR);
  process.on("SIGINT", () => {
    process.stdout.write(SHOW_CURSOR + "\n");
    process.exit(0);
  });
  const recent: Tick[] = [];
  let total = 0;
  const tools = ["Bash", "Read", "Edit", "Glob", "Grep", "WebFetch", "Agent"];
  const models = ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"];
  const start = Date.now();
  const stop = start + 90_000; // 90 seconds of demo
  while (Date.now() < stop) {
    const cost = Math.random() < 0.05 ? 0.6 + Math.random() * 1.4 : Math.random() * 0.3;
    const tk: Tick = {
      ts: Date.now(),
      model: models[Math.floor(Math.random() * models.length)] ?? "claude-opus-4-7",
      cost,
      filePath: "/demo",
      toolNames:
        Math.random() < 0.6
          ? [tools[Math.floor(Math.random() * tools.length)] ?? "Bash"]
          : [],
    };
    recent.push(tk);
    total += cost;
    while (recent.length > 12) recent.shift();
    render(recent, total, 0, "(demo mode)");
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 900));
  }
  process.stdout.write(SHOW_CURSOR + "\n" + dim("demo finished — exiting.\n"));
}
