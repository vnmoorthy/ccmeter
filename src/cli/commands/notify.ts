// `ccmeter notify` — desktop budget notifications.
//
// Modes:
//   ccmeter notify             → one-shot: check now, fire a notification if
//                                projected monthly > budget
//   ccmeter notify --watch     → polling daemon: check every --interval and
//                                fire on threshold crossings, suppressed for
//                                --quiet seconds after each fire to avoid spam
//
// Backends: macOS osascript, Linux notify-send, Windows toast (best-effort).
// All optional — if no backend available, prints to stdout.

import { spawnSync } from "node:child_process";
import { analyze } from "../../core/analyze.js";
import { getBudget } from "../../core/budget.js";
import { fmtUSD } from "../ui/format.js";
import pc from "picocolors";

const { bold, dim, yellow, red, green } = pc;

export interface NotifyOptions {
  watch?: boolean;
  interval?: string;     // seconds between checks in --watch mode
  quiet?: string;        // seconds of silence after a fired notification
  threshold?: string;    // 0-1, default 0.9 — fraction of monthly budget
  budget?: string;       // override saved budget for this run
}

export async function runNotify(opts: NotifyOptions): Promise<void> {
  const intervalSec = Math.max(15, parseInt(opts.interval ?? "300", 10));
  const quietSec = Math.max(60, parseInt(opts.quiet ?? "3600", 10));
  const threshold = clamp(parseFloat(opts.threshold ?? "0.9"), 0.1, 1.5);

  const overrideBudget = opts.budget !== undefined ? parseFloat(opts.budget) : undefined;
  const stored = await getBudget();
  const budget = overrideBudget ?? stored?.monthlyUsd;

  if (!budget || budget <= 0) {
    process.stderr.write(
      red("no budget set. ") +
        dim("run ") +
        bold("ccmeter budget --set 200") +
        dim(" first, or pass --budget 200 to this command.\n"),
    );
    process.exitCode = 1;
    return;
  }

  if (!opts.watch) {
    // One-shot: fire only if actually at/over threshold. Otherwise just
    // print the status line and exit cleanly.
    await checkAndNotify(budget, threshold);
    return;
  }

  // Watch mode.
  process.stdout.write(
    `${bold("ccmeter notify --watch")}\n` +
      dim(
        `  budget    $${budget.toFixed(2)}/mo, threshold ${(threshold * 100).toFixed(0)}%\n` +
          `  interval  ${intervalSec}s\n` +
          `  quiet     ${quietSec}s after each fire\n` +
          `  Ctrl-C to stop.\n\n`,
      ),
  );

  let lastFiredAt = 0;
  process.on("SIGINT", () => {
    process.stdout.write(dim("\n→ stopped.\n"));
    process.exit(0);
  });
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const fired = await checkAndNotify(budget, threshold, lastFiredAt + quietSec * 1000);
    if (fired) lastFiredAt = Date.now();
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
  }
}

async function checkAndNotify(
  monthlyBudget: number,
  threshold: number,
  silentUntilMs = 0,
): Promise<boolean> {
  const a = await analyze({ days: 7, fillGaps: false });
  const last7 = a.totals.totalCost;
  const projectedMonthly = last7 * (30 / 7);
  const ratio = projectedMonthly / monthlyBudget;
  const ts = new Date().toLocaleTimeString();

  const status =
    ratio >= 1
      ? red(`OVER`)
      : ratio >= threshold
        ? yellow(`NEAR`)
        : green(`OK`);

  process.stdout.write(
    `${dim(`[${ts}]`)} projected $${projectedMonthly.toFixed(2)}/mo ` +
      `(${(ratio * 100).toFixed(0)}% of $${monthlyBudget.toFixed(2)} budget) ${status}\n`,
  );

  if (ratio < threshold) return false;
  if (Date.now() < silentUntilMs) {
    process.stdout.write(dim("  (suppressed; in quiet window)\n"));
    return false;
  }

  const title = "ccmeter — budget alert";
  const subtitle = ratio >= 1 ? "OVER monthly budget" : "near monthly budget";
  const body =
    `Projected ${fmtUSD(projectedMonthly)}/mo at last-7d run rate ` +
    `(${(ratio * 100).toFixed(0)}% of ${fmtUSD(monthlyBudget)} budget). ` +
    `Run \`ccmeter recommend\` for fixes.`;

  fireNotification(title, subtitle, body);
  return true;
}

function fireNotification(title: string, subtitle: string, body: string): void {
  // macOS — `osascript` is available everywhere on Mac.
  if (process.platform === "darwin") {
    const script = `display notification ${q(body)} with title ${q(title)} subtitle ${q(subtitle)}`;
    const r = spawnSync("osascript", ["-e", script], { stdio: "ignore" });
    if (r.status === 0) return;
  }
  // Linux — notify-send if available.
  if (process.platform === "linux") {
    const r = spawnSync("notify-send", ["-a", "ccmeter", title, `${subtitle}\n${body}`], {
      stdio: "ignore",
    });
    if (r.status === 0) return;
  }
  // Windows — best-effort PowerShell toast.
  if (process.platform === "win32") {
    const ps = `[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] | Out-Null; $msg = '${escapePs(title)}: ${escapePs(body)}'; Write-Host $msg`;
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
    return;
  }
  // Fallback — just print to terminal.
  process.stdout.write(red(`! ${title} — ${subtitle}\n  ${body}\n`));
}

function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function escapePs(s: string): string {
  return s.replace(/'/g, "''");
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
