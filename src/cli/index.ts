// ccmeter CLI entrypoint.
// Wires every subcommand. Default invocation runs `summary`.

import { Command } from "commander";
import pc from "picocolors";
import { setLevel } from "../core/logger.js";

export const VERSION = "0.3.0";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("ccmeter")
    .description(
      "Local-first spend & cache-efficiency dashboard for Claude Code.\n" +
        "Reads ~/.claude/projects, no network, no API key.",
    )
    .version(VERSION, "-v, --version", "show version")
    .option("--log-level <level>", "logging level: debug|info|warn|error", "warn")
    .option("--log-dir <path>", "override Claude Code log directory")
    .option("--demo", "use synthetic data (no Claude Code installation needed)")
    .option(
      "--anonymize",
      "replace project paths and session ids with stable anonymized labels (safe for screenshots / launch demos)",
    )
    .option(
      "--auto-tag-git",
      "auto-tag sessions with their git branch (skipped on main/master). Equivalent to CCMETER_GIT_AUTOTAG=1.",
    )
    .hook("preAction", (cmd) => {
      const opts = cmd.opts<{
        logLevel?: string;
        logDir?: string;
        demo?: boolean;
        anonymize?: boolean;
        autoTagGit?: boolean;
      }>();
      if (opts.logLevel) {
        const lvl = opts.logLevel.toLowerCase();
        if (lvl === "debug" || lvl === "info" || lvl === "warn" || lvl === "error") {
          setLevel(lvl);
        }
      }
      if (opts.logDir) {
        process.env.CCMETER_LOG_DIR = opts.logDir;
      }
      if (opts.demo) {
        process.env.CCMETER_DEMO = "1";
      }
      if (opts.anonymize) {
        process.env.CCMETER_ANONYMIZE = "1";
      }
      if (opts.autoTagGit) {
        process.env.CCMETER_GIT_AUTOTAG = "1";
      }
    });

  program
    .command("summary", { isDefault: true })
    .description("one-screen overview of your spend, cache health, and trends")
    .option("--days <n>", "lookback window (default 30)", "30")
    .option("--project <p>", "filter to a single project path or substring")
    .option("--no-color", "disable color output")
    .action(async (opts) => {
      const { runSummary } = await import("./commands/summary.js");
      await runSummary(opts);
    });

  program
    .command("sessions")
    .description("list sessions sortable by cost, duration, or busts")
    .option("--top <n>", "rows to show (default 25)", "25")
    .option("--sort <key>", "cost|duration|busts|date (default cost)", "cost")
    .option("--project <p>", "filter to a project")
    .option("--days <n>", "lookback window (default 30)", "30")
    .option("--tag <name>", "filter to sessions with this tag")
    .option("--json", "machine-readable JSON output")
    .action(async (opts) => {
      const { runSessions } = await import("./commands/sessions.js");
      await runSessions(opts);
    });

  program
    .command("cache")
    .description("cache hit rate, bust count, and bust cost over time")
    .option("--days <n>", "lookback window (default 30)", "30")
    .option("--project <p>", "filter to a project")
    .action(async (opts) => {
      const { runCache } = await import("./commands/cache.js");
      await runCache(opts);
    });

  program
    .command("recommend")
    .description("personalized cost-cutting suggestions based on your patterns")
    .option("--days <n>", "lookback window (default 30)", "30")
    .option("--min-savings <n>", "hide recs below this monthly $ savings", "0")
    .option("--json", "machine-readable JSON output")
    .action(async (opts) => {
      const { runRecommend } = await import("./commands/recommend.js");
      await runRecommend(opts);
    });

  program
    .command("dashboard")
    .description("start the local web dashboard at http://127.0.0.1:<port>")
    .option("--port <n>", "port (default 7777)", "7777")
    .option("--no-open", "do not auto-open the browser")
    .action(async (opts) => {
      const { runDashboard } = await import("./commands/dashboard.js");
      await runDashboard(opts);
    });

  program
    .command("export")
    .description("export the full analysis as json|csv|md")
    .option("--format <f>", "json|csv|md (default json)", "json")
    .option("--out <path>", "output file (default stdout)")
    .option("--days <n>", "lookback window (default 30)", "30")
    .option("--no-redact", "do not redact project paths")
    .option("--anonymize", "fully hash project paths and session ids for safe sharing")
    .action(async (opts) => {
      const { runExport } = await import("./commands/export.js");
      await runExport(opts);
    });

  program
    .command("watch")
    .description("live-tail today's spend as Claude Code writes new turns")
    .option("--interval <ms>", "refresh interval in ms (default 2000)", "2000")
    .action(async (opts) => {
      const { runWatch } = await import("./commands/watch.js");
      await runWatch(opts);
    });

  program
    .command("whatif")
    .description("simulate spend under alternative pricing or model choices")
    .option("--days <n>", "lookback window (default 30)", "30")
    .option("--swap <pair>", "model swap, e.g. 'opus->sonnet' (repeatable)", collect, [])
    .option("--cache-ttl <seconds>", "simulate a different cache TTL", "300")
    .option("--disable-cache", "simulate caching being completely off")
    .action(async (opts) => {
      const { runWhatIf } = await import("./commands/whatif.js");
      await runWhatIf(opts);
    });

  program
    .command("budget")
    .description("set and check a monthly spend budget")
    .option("--set <amount>", "set monthly budget in dollars (e.g. 200)")
    .option("--clear", "remove the budget")
    .action(async (opts) => {
      const { runBudget } = await import("./commands/budget.js");
      await runBudget(opts);
    });

  program
    .command("digest")
    .description("post a weekly digest to a Slack/Discord webhook")
    .option("--webhook <url>", "webhook URL (or set CCMETER_WEBHOOK_URL)")
    .option("--days <n>", "window covered by digest (default 7)", "7")
    .option("--dry-run", "print the payload, do not POST")
    .action(async (opts) => {
      const { runDigest } = await import("./commands/digest.js");
      await runDigest(opts);
    });

  program
    .command("merge")
    .description("merge analyses from multiple machines into one report")
    .argument("<files...>", "ccmeter export json files to merge")
    .option("--out <path>", "where to write the merged json (default stdout)")
    .action(async (files: string[], opts) => {
      const { runMerge } = await import("./commands/merge.js");
      await runMerge(files, opts);
    });

  program
    .command("doctor")
    .description("diagnose ccmeter setup: log dir, file counts, parse health")
    .action(async () => {
      const { runDoctor } = await import("./commands/doctor.js");
      await runDoctor();
    });

  program
    .command("check-privacy")
    .description("show exactly which files would be read; confirm no network calls")
    .action(async () => {
      const { runCheckPrivacy } = await import("./commands/check-privacy.js");
      await runCheckPrivacy();
    });

  program
    .command("clear-cache")
    .description("clear the parsed-result cache at ~/.cache/ccmeter")
    .action(async () => {
      const { runClearCache } = await import("./commands/clear-cache.js");
      await runClearCache();
    });

  program
    .command("prompt")
    .description("emit today's spend as a single line — pipe into your shell PS1")
    .option("--budget <amount>", "highlight orange/red as you near a daily budget fraction")
    .option("--no-color", "disable color escapes (for plain shells)")
    .action(async (opts) => {
      const { runPrompt } = await import("./commands/prompt.js");
      await runPrompt(opts);
    });

  program
    .command("metrics")
    .description("emit Prometheus-format metrics on stdout (or via dashboard /api/metrics)")
    .option("--days <n>", "lookback window (default 7)", "7")
    .action(async (opts) => {
      const { runMetrics } = await import("./commands/metrics.js");
      await runMetrics(opts);
    });

  program
    .command("tools")
    .description("per-tool cost breakdown (Bash, Read, Edit, …) — answers “which tool ate the budget”")
    .option("--days <n>", "lookback window (default 30)", "30")
    .option("--project <p>", "filter to a project")
    .option("--json", "machine-readable JSON output")
    .action(async (opts) => {
      const { runTools } = await import("./commands/tools.js");
      await runTools(opts);
    });

  program
    .command("tag")
    .description("annotate a session for grouped reporting (e.g. tag a PR or feature)")
    .argument("[sessionId]", "session id to tag (omit to list all tags)")
    .argument("[label]", "tag to apply")
    .option("--list", "list every tag and its window-aggregate spend")
    .option("--remove", "remove the tag from this session")
    .action(async (sessionId, label, opts) => {
      const { runTag } = await import("./commands/tag.js");
      await runTag(sessionId, label, opts);
    });

  program
    .command("share")
    .description("emit a shareable Markdown stat-card or social-friendly SVG")
    .option("--days <n>", "lookback window (default 30)", "30")
    .option("--format <f>", "md|svg (default md)", "md")
    .option("--out <path>", "output file (default stdout)")
    .option("--fuzzy", "round to friendly bands (e.g. ~$200) — best for public posts")
    .action(async (opts) => {
      const { runShare } = await import("./commands/share.js");
      await runShare(opts);
    });

  program
    .command("live")
    .description("full-screen live ticker showing each turn as it lands (great for demos)")
    .option("--interval <ms>", "tick interval in ms (default 1500)", "1500")
    .action(async (opts) => {
      const { runLive } = await import("./commands/live.js");
      await runLive(opts);
    });

  program
    .command("selftest")
    .description("validate the parser/pricing against your real ~/.claude/projects data")
    .option("--no-redact", "show full file paths in the output")
    .option("--sample-turns <n>", "how many sample turn-shapes to print", "5")
    .option("--max-files <n>", "cap files scanned (helps on huge histories)", "200")
    .option("--json", "machine-readable JSON output for issue reports")
    .action(async (opts) => {
      const { runSelftest } = await import("./commands/selftest.js");
      await runSelftest(opts);
    });

  program
    .command("prompts")
    .description("rank assistant turns by output-tokens-per-dollar (which prompts are high-yield)")
    .option("--days <n>", "lookback window (default 30)", "30")
    .option("--top <n>", "rows in best-yield list (default 10)", "10")
    .option("--bottom <n>", "rows in worst-yield list (default 10)", "10")
    .option("--json", "machine-readable JSON output")
    .action(async (opts) => {
      const { runPrompts } = await import("./commands/prompts.js");
      await runPrompts(opts);
    });

  program
    .command("notify")
    .description("desktop notification when projected monthly spend approaches your budget")
    .option("--watch", "stay running and re-check on an interval")
    .option("--interval <s>", "seconds between checks in --watch mode (default 300)", "300")
    .option("--quiet <s>", "seconds of silence after a fired notification (default 3600)", "3600")
    .option("--threshold <r>", "fraction of budget that triggers a notification (default 0.9)", "0.9")
    .option("--budget <amount>", "override the saved monthly budget for this run")
    .action(async (opts) => {
      const { runNotify } = await import("./commands/notify.js");
      await runNotify(opts);
    });

  program
    .command("reconcile")
    .description("diff ccmeter's local total vs Anthropic's authoritative usage (requires ANTHROPIC_API_KEY)")
    .option("--days <n>", "lookback window (default 30)", "30")
    .option("--json", "machine-readable JSON output")
    .action(async (opts) => {
      const { runReconcile } = await import("./commands/reconcile.js");
      await runReconcile(opts);
    });

  program
    .command("pricing")
    .description("print the active pricing table (built-in + your overrides)")
    .option("--json", "machine-readable JSON output")
    .action(async (opts) => {
      const { runPricing } = await import("./commands/pricing.js");
      await runPricing(opts);
    });

  program
    .command("compare")
    .description("week-over-week (or any two periods) cost & cache deltas")
    .option("--periods <pair>", "comma-pair: 7,7 (this 7d vs prior 7d) | 30,30", "7,7")
    .option("--json", "machine-readable JSON output")
    .action(async (opts) => {
      const { runCompare } = await import("./commands/compare.js");
      await runCompare(opts);
    });

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(pc.red(`ccmeter: ${msg}\n`));
    process.exit(1);
  }
}

function collect(value: string, prev: string[]): string[] {
  return prev.concat([value]);
}

main();
