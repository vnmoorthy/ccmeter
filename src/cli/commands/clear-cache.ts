// `ccmeter clear-cache` — drop ~/.cache/ccmeter/parsed/*.

import pc from "picocolors";
import { clearCache } from "../../core/cache/store.js";

export async function runClearCache(): Promise<void> {
  const r = await clearCache();
  process.stdout.write(
    pc.green(
      `✓ cleared ${r.removed} cached parses (${(r.bytes / 1024 / 1024).toFixed(2)} MB)\n`,
    ),
  );
}
