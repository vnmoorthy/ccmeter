# ccmeter — launch kit

Everything you need to ship the project on a Tuesday morning. Cut, paste, send.

---

## Show HN title (≤80 chars)

> Show HN: ccmeter – local-first spend & cache dashboard for Claude Code

Alternates if the first flags as too marketing-ish:

- Show HN: I built a tool to find where my Claude Code bill went after the cache nerf
- Show HN: ccmeter – read your ~/.claude logs and find what's actually costing you

## Show HN body

> Hi HN — ccmeter is a single-binary CLI plus localhost dashboard that parses Claude Code's `~/.claude/projects/*.jsonl` files and tells you exactly where your spend is going.
>
> Background: in early March 2026, Anthropic quietly shortened Claude Code's default prompt-cache TTL from 1 hour to 5 minutes (anthropics/claude-code#46829). The rollout was staggered, hitting different machines on different days. Anthropic's official position is that the change should not increase costs because most cached context is one-shot. User analysis of session JSONLs disagrees — typical impact is a 30–60% bill increase with no behavioral change. The Anthropic Console gives you a single bill number; what was missing was the per-session, per-cache-bust breakdown that lets you settle that argument with your own data.
>
> ccmeter parses every JSONL session file Claude Code writes, computes per-turn cost from the public pricing table, detects cache busts (a write that follows previous cache activity by more than the TTL), and surfaces twelve rule-based recommendations ranked by estimated monthly savings.
>
> Defaults: zero network, zero credentials, zero telemetry. The web dashboard binds 127.0.0.1 only with a per-launch bearer token. The whole codebase is intentionally under 5,000 lines so you can audit it in a sitting.
>
> Try it: `npx ccmeter`.
>
> Repo: https://github.com/vnmoorthy/ccmeter

## r/ClaudeAI post

Title: I built a free tool to figure out where my Claude Code bill is actually going

Body:

> After Anthropic's early-March cache TTL rollout, my Claude Code bill jumped roughly 50% with no change in how I was using it. The Anthropic Console only gives me a single number per day, so I built ccmeter to read the JSONL session files Claude Code already writes to disk and break the spend down by session, project, model, and cache-bust event.
>
> It runs entirely locally — no API key, no telemetry, no signup. Just `npx ccmeter`.
>
> What it surfaces:
> - Daily / monthly spend, broken out by model and project
> - Cache hit rate, bust count, $ wasted on busts
> - A leaderboard of your most expensive sessions (with one-line "why")
> - Twelve concrete recommendations ranked by est. monthly savings (e.g. "switch this Opus session pattern to Sonnet, save ~$45/mo")
> - A localhost dashboard with charts (`ccmeter dashboard`)
>
> MIT licensed, contributions welcome — adding a new recommendation rule is a 30-line PR.
>
> Repo: https://github.com/vnmoorthy/ccmeter
>
> Happy to answer questions or help debug if your numbers don't match the Console.

## Twitter thread (6 tweets)

1/ My Claude Code bill jumped 50% in March — same code, same workflow. The Anthropic Console only shows me a daily total. So I built ccmeter to read my session logs and tell me what was actually different.

2/ ccmeter is a local CLI. `npx ccmeter`. Zero network, zero API key, zero telemetry. It parses ~/.claude/projects/*.jsonl, computes cost per turn, detects cache busts, surfaces patterns.

3/ Anthropic shortened Claude Code's default cache TTL from 1h to 5m in early March (anthropics/claude-code#46829). They say that shouldn't increase costs — for many users it has, by 30–60%. With 5m, any session that idles past 5 minutes re-pays full input next turn. ccmeter shows me 41 of those per week (~$43/mo I can recover).

4/ Twelve recommendation rules, each in its own 30-line file. Examples that fired on my data:
• "Idle cache-bust" (top by impact)
• "Opus is doing Sonnet-grade work in 6 sessions" (saved ~$50/mo)
• "Long sessions bled cache value"
• "Weekend spike" (an agent I forgot was running)

5/ There's also a localhost dashboard (`ccmeter dashboard`) — Recharts, dark mode, hit-rate over time, calendar heatmap of busts, a what-if simulator. Bound to 127.0.0.1 with a per-launch token.

6/ Repo + 60s screencast: https://github.com/vnmoorthy/ccmeter

## awesome-claude-code PR (3 lines)

```md
- [ccmeter](https://github.com/vnmoorthy/ccmeter) — Local-first CLI + dashboard that reads `~/.claude/projects/*.jsonl` and reports spend by session/project/model, detects cache busts (with $ wasted), and recommends fixes. Zero network, zero telemetry. `npx ccmeter`.
```

## SkillsMP submission

Submit `skills/ccmeter/SKILL.md` to https://skillsmp.com with:

- Title: ccmeter — narrate your Claude Code spend
- Description: Lets Claude Code report your actual spend, cache health, and optimization opportunities by calling the local ccmeter CLI.
- Category: Productivity / Observability
- Tags: claude-code, cost, observability, cache, billing
- Repo: https://github.com/vnmoorthy/ccmeter

## Hacker News comment to leave on the next "Anthropic pricing" front-page post

> If anyone's trying to actually quantify what changed for them after Anthropic's early-March cache-TTL rollout, I built ccmeter (https://github.com/vnmoorthy/ccmeter) — local CLI that parses your ~/.claude logs and tells you exactly which sessions are the new expensive ones. `npx ccmeter`, no setup, no telemetry. Doesn't fix Anthropic's pricing decisions but at least gives you a number to argue with internally.

## Cast.gif checklist (the single most important launch asset)

Record at `1280x800`, 24fps, max 30 seconds. Capture:

1. `ccmeter` (default summary, beautiful KPI block, sparkline)
2. `ccmeter cache` (early-March-2026 TTL rollout callout if visible in your data)
3. `ccmeter recommend` (top 2 recommendations expand)
4. `ccmeter dashboard` opens browser, dashboard appears

Tools: `vhs`, `asciinema-rec` + `agg`, or `terminalizer`. Save to `docs/summary.gif`. Linked from the README's first paragraph and from the Show HN post.

## Day-of timeline (US East timezone)

- 8:50am ET: tag v0.2.0 → CI publishes to npm
- 9:00am ET: post Show HN with the body above
- 9:01am ET: tweet thread
- 9:05am ET: r/ClaudeAI post
- 9:10am ET: Slack #observability community channels (LangChain Discord, AI Engineer)
- During day: respond to every HN/Reddit comment within 30 minutes
- 6:00pm ET: post a v0.2.1 with the most-requested fix from the day's feedback

## What you do NOT do on launch day

- Apologize for incompleteness. The product works.
- Promise features. Roadmap is in the README; that's enough.
- Get into pricing arguments with Anthropic defenders. Stay focused: the tool is the answer.
