// `ccmeter dashboard` — boot the local server and open the browser.

import pc from "picocolors";
import { startServer } from "../../web/server.js";

interface DashboardOpts {
  port?: string;
  open?: boolean;
}

export async function runDashboard(opts: DashboardOpts): Promise<void> {
  const port = parseInt(String(opts.port ?? 7777), 10);
  const handle = await startServer({ port });
  process.stdout.write(`\n${pc.green("✓")} ccmeter dashboard live\n`);
  process.stdout.write(`  ${pc.cyan(handle.url)}\n`);
  process.stdout.write(pc.dim(`  (the URL contains an access token; treat it like a session key)\n\n`));
  process.stdout.write(pc.dim(`Ctrl-C to stop.\n`));
  if (opts.open !== false) {
    await tryOpen(handle.url);
  }
  // keep process alive
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      handle.close().then(resolve);
    });
    process.on("SIGTERM", () => {
      handle.close().then(resolve);
    });
  });
}

async function tryOpen(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    const { spawn } = await import("node:child_process");
    const child = spawn(cmd[0]!, cmd.slice(1), { stdio: "ignore", detached: true });
    child.on("error", () => {
      /* user can copy URL */
    });
    child.unref();
  } catch {
    /* not opening is fine */
  }
}
