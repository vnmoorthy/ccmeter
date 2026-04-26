#!/usr/bin/env node
// ccmeter — local-first spend & cache dashboard for Claude Code
// Thin shim: import the compiled CLI and let it own argv parsing.
import("../dist/cli/index.js").catch((err) => {
  console.error("ccmeter failed to start:", err?.stack || err?.message || err);
  process.exit(1);
});
