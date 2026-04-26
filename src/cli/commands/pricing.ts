// `ccmeter pricing` — print the active pricing table.
//
// Trust beats marketing: if a user's numbers don't match the Anthropic
// Console, the first thing they should be able to do is `ccmeter pricing`
// and inspect the unit costs. Overrides at ~/.config/ccmeter/pricing.json
// are loaded first so this view reflects what's actually in use.

import pc from "picocolors";
import { listModels, loadOverrides, getPricingVerifiedDate } from "../../core/pricing/models.js";
import { renderTable } from "../ui/table.js";

const { bold, dim } = pc;

export interface PricingOpts {
  json?: boolean;
}

export async function runPricing(opts: PricingOpts): Promise<void> {
  await loadOverrides();
  const rows = listModels();

  if (opts.json) {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    return;
  }

  process.stdout.write(
    `\n${bold("ccmeter pricing — active table")}\n` +
      dim(`built-in rates verified ${getPricingVerifiedDate()}; overrides in ~/.config/ccmeter/pricing.json take precedence\n\n`),
  );
  process.stdout.write(
    renderTable({
      head: ["Model", "Input", "Output", "5m write", "1h write", "Cache read"],
      align: ["left", "right", "right", "right", "right", "right"],
      rows: rows.map(({ id, pricing }) => [
        bold(id),
        money(pricing.input),
        money(pricing.output),
        money(pricing.cache_5m_write),
        money(pricing.cache_1h_write),
        money(pricing.cache_read),
      ]),
    }),
  );
  process.stdout.write(
    "\n" +
      dim("All rates per 1M tokens. Override any model with a JSON file at the path above:\n") +
      dim('  { "claude-sonnet-4-6": { "input": 3.0, "output": 15.0, "cache_5m_write": 3.75, "cache_1h_write": 6.0, "cache_read": 0.3 } }\n'),
  );
}

function money(n: number): string {
  return "$" + n.toFixed(2);
}
