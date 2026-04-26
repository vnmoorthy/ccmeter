---
name: ccmeter
description: Use this skill whenever the user asks about their Claude Code spend, cost, token usage, cache efficiency, sessions, or anything related to "what is Claude costing me". Triggers include "how much did I spend", "why did my bill go up", "what session was most expensive", "do I have cache problems", "show me my Claude Code usage", "any sessions waste a lot of cache", "spend by project", "spend this week / month / today". This skill calls the local `ccmeter` CLI which reads `~/.claude/projects/*.jsonl` with no network access, then narrates the result. Do NOT trigger for questions about API pricing in the abstract or unrelated billing topics — this is specifically for the user's own Claude Code session-log analysis.
---

# ccmeter — narrate the user's Claude Code spend

ccmeter is a local CLI that parses Claude Code's session JSONL files and reports spend, cache health, and recommendations. As a skill, your job is to:

1. Detect the user's intent (overview, drill-in, optimization).
2. Invoke ccmeter with the right flags.
3. Read the JSON output and turn it into a clear, human reply.

## Tools you'll call

All ccmeter invocations should pass `--format json` (where applicable) or `--json` so you can parse the output reliably. Use `Bash` to run them.

| user intent | command |
| --- | --- |
| "how much did I spend?" | `ccmeter export --format json --days 30` |
| "what about today?" | `ccmeter export --format json --days 1` |
| "this week?" | `ccmeter export --format json --days 7` |
| "what was my most expensive session?" | `ccmeter sessions --top 1 --json --days 30` |
| "do I have cache problems?" | `ccmeter export --format json --days 14` then look at `totals.busts`, `totals.bustCost` |
| "what should I change?" | `ccmeter recommend --json --days 30` |
| "show me by project" | `ccmeter export --format json --days 30` then look at `byProject` |
| "which tool is the most expensive?" | `ccmeter tools --json --days 30` |
| "what changed this week vs last?" | `ccmeter compare --periods 7,7 --json` |
| "what would I save by switching to Sonnet?" | `ccmeter whatif --swap opus->sonnet --days 30` |
| "show me sessions for the auth-refactor PR" | `ccmeter sessions --tag auth-refactor --json` |
| "give me a shareable summary" | `ccmeter share --fuzzy` (Markdown) or `ccmeter share --format svg` |
| "show me the price you're using" | `ccmeter pricing --json` |

If `ccmeter` isn't installed, run `npx ccmeter@latest export --format json --days 30` instead — it works without a global install.

## Reading the JSON

Top-level fields you care about:

```ts
{
  totals: {
    totalCost: number,        // USD
    sessions: number,
    cacheHitRatio: number,    // 0..1
    busts: number,
    bustCost: number,         // USD wasted on cache busts
  },
  byProject: [{ projectPath, totalCost, sessions, cacheHitRatio, bustCost }],
  byModel:   [{ model, totalCost, turns }],
  byTool:    [{ name, calls, sessionsUsedIn, attributedCost, avgCostPerCall }],
  daily:     [{ date, totalCost, busts, bustCost }],
  recommendations: [{ severity, title, body, estimatedMonthlySavings, evidence }],
}
```

## Narration style

- Lead with the headline number ("$XX in the last N days").
- Say whether it's up or down vs the prior period (compare halves of `daily`).
- Surface the single most actionable recommendation by name, not all of them.
- Quote `estimatedMonthlySavings` honestly — "could save ~$X/month if you act on this".
- If asked, expand into specific evidence sessions.
- Keep responses short by default. Offer to "go deeper into X" rather than dumping all of it.

## What NOT to do

- Do not narrate raw JSON to the user. Translate it.
- Do not invent numbers or extrapolate beyond what ccmeter returned.
- Do not explain ccmeter itself unless the user asks. They want their data.
- If the data is empty, say so clearly: "I don't see any Claude Code activity in the last N days — is your `~/.claude/projects` directory in a non-default location? Set `CCMETER_LOG_DIR` if so."

## Example exchange

> User: how much have I spent on Claude Code this month?

[run `ccmeter export --format json --days 30` → parse]

> You: $284 in the last 30 days, up 43% vs the prior 30. Most of that ($178) was in the `monorepo-frontend` project. Your cache hit rate is 47% — there are 89 cache busts costing about $24/month in waste; the top recommendation is to end idle sessions sooner (~$43/month savings). Want me to break it down by project, by day, or dig into the worst sessions?
