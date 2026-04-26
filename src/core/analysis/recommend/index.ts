// Rule registry and runner. Each rule is a pure function from an Analysis
// (minus its own recommendations) to zero or more Recommendations.
//
// To add a rule: drop a file in this directory exporting a Rule, then add
// it to RULES below. The 30-line template lives in rules/_template.ts.

import type { Analysis, Recommendation } from "../../types.js";

import { idleCacheBustRule } from "./rules/idle-cache-bust.js";
import { exploratoryQueryRule } from "./rules/exploratory-query.js";
import { longSessionRule } from "./rules/long-session.js";
import { modelOverkillRule } from "./rules/model-overkill.js";
import { hotProjectRule } from "./rules/hot-project.js";
import { duplicateSessionRule } from "./rules/duplicate-session.js";
import { tinyOutputRule } from "./rules/tiny-output.js";
import { afterHoursRule } from "./rules/after-hours.js";
import { stale1hCacheRule } from "./rules/stale-1h-cache.js";
import { agenticBlowupRule } from "./rules/agentic-blowup.js";
import { compactSpamRule } from "./rules/compact-spam.js";
import { weekendSpikeRule } from "./rules/weekend-spike.js";

export type Rule = (a: Omit<Analysis, "recommendations">) => Recommendation[];

const RULES: Rule[] = [
  idleCacheBustRule,
  exploratoryQueryRule,
  longSessionRule,
  modelOverkillRule,
  hotProjectRule,
  duplicateSessionRule,
  tinyOutputRule,
  afterHoursRule,
  stale1hCacheRule,
  agenticBlowupRule,
  compactSpamRule,
  weekendSpikeRule,
];

export function runRecommendations(a: Omit<Analysis, "recommendations">): Recommendation[] {
  const out: Recommendation[] = [];
  for (const rule of RULES) {
    try {
      out.push(...rule(a));
    } catch {
      // never let one rule break the report
    }
  }
  // Highest impact first; high severity wins ties.
  out.sort((x, y) => {
    if (x.estimatedMonthlySavings !== y.estimatedMonthlySavings) {
      return y.estimatedMonthlySavings - x.estimatedMonthlySavings;
    }
    return sevWeight(y.severity) - sevWeight(x.severity);
  });
  return out;
}

function sevWeight(s: Recommendation["severity"]): number {
  return s === "high" ? 3 : s === "warn" ? 2 : 1;
}
