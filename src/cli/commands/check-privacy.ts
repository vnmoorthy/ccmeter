// `ccmeter check-privacy` — exhaustively answer "what does this tool actually do?".

import pc from "picocolors";
import { findSessionFiles, getCacheDir, getConfigDir, getDefaultLogDir } from "../../core/paths.js";

export async function runCheckPrivacy(): Promise<void> {
  const dir = getDefaultLogDir();
  const cacheDir = getCacheDir();
  const cfgDir = getConfigDir();
  const files = await findSessionFiles(dir).catch(() => []);

  process.stdout.write(`\n${pc.bold("ccmeter — privacy audit")}\n`);
  process.stdout.write(`${pc.gray("─".repeat(60))}\n\n`);

  process.stdout.write(`${pc.green("READS")} (this tool will open these files):\n`);
  process.stdout.write(`  ${dir}\n`);
  process.stdout.write(`    → ${files.length} .jsonl files\n`);
  for (const f of files.slice(0, 5)) process.stdout.write(`      • ${f.path}\n`);
  if (files.length > 5) process.stdout.write(`      … +${files.length - 5} more\n`);
  process.stdout.write(`  ${cfgDir}/pricing.json   (optional pricing overrides)\n`);
  process.stdout.write(`  ${cfgDir}/budget.json    (optional monthly budget)\n\n`);

  process.stdout.write(`${pc.green("WRITES")} (this tool will create these files):\n`);
  process.stdout.write(`  ${cacheDir}/parsed/*.json.gz   (gzipped parsed-result cache)\n\n`);

  process.stdout.write(`${pc.green("NETWORK")}:\n`);
  process.stdout.write(`  default commands         → ${pc.bold("zero")} network calls\n`);
  process.stdout.write(`  ccmeter digest           → POST to a Slack/Discord webhook you specify\n`);
  process.stdout.write(`  CCMETER_CHECK_UPDATES=1  → optional GET https://registry.npmjs.org/ccmeter\n\n`);

  process.stdout.write(`${pc.green("WHAT IS NOT READ OR SENT")}:\n`);
  process.stdout.write(`  • your source code\n`);
  process.stdout.write(`  • the contents of any individual prompt or response\n`);
  process.stdout.write(`  • environment variables, ssh keys, AWS creds, anything outside the dirs above\n`);
  process.stdout.write(`  • analytics, telemetry, ping-home — none of it\n\n`);

  process.stdout.write(`${pc.dim("Read the source: https://github.com/vnmoorthy/ccmeter\n")}`);
  process.stdout.write(`${pc.dim("Audit the parser: src/core/jsonl/reader.ts (130 lines)\n\n")}`);
}
