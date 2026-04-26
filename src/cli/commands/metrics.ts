// `ccmeter metrics` — Prometheus exposition format on stdout. Useful for
// scraping into Grafana or piping into a node_exporter sidecar.

import { analyze } from "../../core/analyze.js";

interface MetricsOpts {
  days?: string;
}

export async function runMetrics(opts: MetricsOpts): Promise<void> {
  const days = parseInt(String(opts.days ?? 7), 10);
  const a = await analyze({ days });
  const lines: string[] = [];
  push(lines, "# HELP ccmeter_total_spend_usd total Claude Code spend in USD over the lookback window");
  push(lines, "# TYPE ccmeter_total_spend_usd gauge");
  push(lines, `ccmeter_total_spend_usd{window_days="${days}"} ${a.totals.totalCost.toFixed(6)}`);

  push(lines, "# HELP ccmeter_sessions total session count");
  push(lines, "# TYPE ccmeter_sessions gauge");
  push(lines, `ccmeter_sessions{window_days="${days}"} ${a.totals.sessions}`);

  push(lines, "# HELP ccmeter_cache_hit_ratio fraction of cache reads vs total cache traffic");
  push(lines, "# TYPE ccmeter_cache_hit_ratio gauge");
  push(lines, `ccmeter_cache_hit_ratio{window_days="${days}"} ${a.totals.cacheHitRatio.toFixed(4)}`);

  push(lines, "# HELP ccmeter_cache_busts total cache busts in the lookback window");
  push(lines, "# TYPE ccmeter_cache_busts gauge");
  push(lines, `ccmeter_cache_busts{window_days="${days}"} ${a.totals.busts}`);

  push(lines, "# HELP ccmeter_cache_bust_cost_usd dollars wasted on cache busts");
  push(lines, "# TYPE ccmeter_cache_bust_cost_usd gauge");
  push(lines, `ccmeter_cache_bust_cost_usd{window_days="${days}"} ${a.totals.bustCost.toFixed(6)}`);

  push(lines, "# HELP ccmeter_spend_by_model_usd spend broken down by model");
  push(lines, "# TYPE ccmeter_spend_by_model_usd gauge");
  for (const m of a.byModel) {
    push(lines, `ccmeter_spend_by_model_usd{model="${escape(m.model)}"} ${m.totalCost.toFixed(6)}`);
  }

  push(lines, "# HELP ccmeter_recommendations_active number of firing recommendations");
  push(lines, "# TYPE ccmeter_recommendations_active gauge");
  push(lines, `ccmeter_recommendations_active ${a.recommendations.length}`);

  push(lines, "# HELP ccmeter_potential_monthly_savings_usd estimated savings if all recommendations are acted on");
  push(lines, "# TYPE ccmeter_potential_monthly_savings_usd gauge");
  push(
    lines,
    `ccmeter_potential_monthly_savings_usd ${a.recommendations
      .reduce((acc, r) => acc + r.estimatedMonthlySavings, 0)
      .toFixed(6)}`,
  );

  process.stdout.write(lines.join("\n") + "\n");
}

function push(lines: string[], s: string): void {
  lines.push(s);
}

function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
