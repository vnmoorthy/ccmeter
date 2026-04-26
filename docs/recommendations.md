# Recommendation catalog

Every rule ccmeter ships with, what it looks for, and how to silence it.

| id | severity | fires when | savings approach |
| --- | --- | --- | --- |
| `idle-cache-bust` | warn / high | ≥5 cache busts in last 7 days from sessions idling past TTL | reproject last-7d waste to monthly |
| `exploratory-query` | info / warn | ≥3 sessions with input >50k, output <500, ≤3 turns | 60% of input cost on these sessions |
| `long-session` | info / warn | ≥2 sessions over 90 min with bust cost > $0.50 | actual bust cost reprojected to month |
| `model-overkill` | warn / high | ≥2 Opus sessions with low output and no tool use | difference vs Sonnet pricing for those sessions |
| `hot-project` | info | ≥3 projects, top one is >50% of spend | informational; 0 estimated savings |
| `duplicate-session` | info / warn | ≥2 sessions in same project within 30 min of each other | input cost paid extra times |
| `tiny-output` | info / warn | ≥4 sessions with output < 50 tokens but input > 5k | input + cache-write cost on those |
| `after-hours` | info | ≥10% of spend between 11pm-6am, total ≥ $10 | informational |
| `stale-1h-cache` | warn | ≥2 sessions wrote 1h cache but never read it | 1h vs 5m write delta |
| `agentic-blowup` | high | ≥1 agentic session with >50 tool calls and >$5 cost | 50% of total (assume half avoidable) |
| `compact-spam` | warn | ≥2 sessions with >30 turns and >80k avg input/turn | 25% of session cost |
| `weekend-spike` | info | weekend share > 40% of weekly spend | informational |

## How to silence a rule

Currently rules can't be silenced via config — the right move is usually to act on the recommendation. If a rule is consistently noisy for your workflow, file an issue with the JSON output of `ccmeter recommend --json` and we'll tune the threshold.

## Adding your own

Copy `src/core/analysis/recommend/rules/_template.ts`. Implement a `Rule` function. Register it in `index.ts`. Add a test. PR welcome.

```ts
import type { Recommendation } from "../../../types.js";
import type { Rule } from "../index.js";

export const myRule: Rule = (a) => {
  if (/* condition */) return [];
  return [{
    id: "my-rule",
    severity: "warn",
    title: "Short, scannable headline",
    body: "One paragraph explaining what's happening and what to do.",
    estimatedMonthlySavings: 0, // honest math; under-promise
    evidence: [
      // up to ~5 sessions that triggered the rule
    ],
  }];
};
```

## Estimation honesty

The hardest part of writing a good rule is the savings estimate. Use these guidelines:

1. Compute savings against actual data, not hypothetical worst case.
2. Project to a month at the user's *current* run rate (not a busy-day extrapolation).
3. When in doubt, halve your estimate. Users who try the recommendation and see less savings than promised lose trust in everything ccmeter says.
4. If the rule is purely informational (no clear dollar fix), set savings to 0 and put it in `severity: "info"`.
