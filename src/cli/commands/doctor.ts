// `ccmeter doctor` — diagnose setup. First thing users hit when something's off.

import fs from "node:fs/promises";
import os from "node:os";
import pc from "picocolors";
import { findSessionFiles, getCacheDir, getConfigDir, getDefaultLogDir } from "../../core/paths.js";
import { cacheStats } from "../../core/cache/store.js";
import { fmtDuration } from "../ui/format.js";
import { VERSION } from "../index.js";

export async function runDoctor(): Promise<void> {
  const dir = getDefaultLogDir();
  const cacheDir = getCacheDir();
  const cfgDir = getConfigDir();

  process.stdout.write(`\nccmeter ${VERSION}  ·  node ${process.version}  ·  ${os.platform()}-${os.arch()}\n\n`);

  await check(`log directory: ${dir}`, async () => {
    await fs.access(dir);
  });

  let files: Awaited<ReturnType<typeof findSessionFiles>> = [];
  try {
    files = await findSessionFiles(dir);
  } catch {
    /* handled above */
  }
  process.stdout.write(`  → found ${files.length} .jsonl files\n`);

  if (files.length > 0) {
    const total = files.reduce((a, f) => a + f.size, 0);
    const newest = files[0]!;
    const oldest = files[files.length - 1]!;
    process.stdout.write(
      `    total ${(total / 1024 / 1024).toFixed(1)} MB  ·  ` +
        `newest ${fmtDuration(Date.now() - newest.mtimeMs)} ago  ·  ` +
        `oldest ${fmtDuration(Date.now() - oldest.mtimeMs)} ago\n`,
    );
  } else {
    process.stdout.write(
      pc.yellow(
        `  ! no session files. Either Claude Code isn't installed, or its logs live elsewhere.\n` +
          `    Set CCMETER_LOG_DIR=/path/to/logs to override.\n`,
      ),
    );
  }

  await check(`cache directory: ${cacheDir}`, async () => {
    await fs.mkdir(cacheDir, { recursive: true });
  });
  const cs = await cacheStats();
  process.stdout.write(
    `  → ${cs.files} cached parses (${(cs.bytes / 1024 / 1024).toFixed(2)} MB)\n`,
  );

  await check(`config directory: ${cfgDir}`, async () => {
    await fs.mkdir(cfgDir, { recursive: true });
  });

  // smoke parse 3 newest files
  if (files.length > 0) {
    const { parseFile } = await import("../../core/jsonl/reader.js");
    const sample = files.slice(0, 3);
    let validTurns = 0;
    let errors = 0;
    let bytes = 0;
    const t0 = Date.now();
    for (const f of sample) {
      const r = await parseFile(f.path, "doctor", f.mtimeMs, f.size);
      validTurns += r.stats.validTurns;
      errors += r.stats.errors;
      bytes += f.size;
    }
    const dt = Date.now() - t0;
    process.stdout.write(
      pc.green(`✓ `) +
        `parsed ${sample.length} sample files (${(bytes / 1024 / 1024).toFixed(1)}MB) in ${fmtDuration(dt)} — ` +
        `${validTurns} turns, ${errors} skipped\n`,
    );
  }

  process.stdout.write(`\nall systems nominal — try ${pc.cyan("ccmeter")} for the summary.\n\n`);
}

async function check(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    process.stdout.write(pc.green(`✓ `) + label + "\n");
  } catch (err) {
    const e = err as Error;
    process.stdout.write(pc.red(`✗ `) + label + pc.dim(`  ${e.message}\n`));
  }
}
