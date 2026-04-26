# Project: ccmeter — the Claude Code spend and efficiency dashboard

## Mission

Build a working v1 of `ccmeter`: a local-first, open-source CLI plus optional web dashboard that reads Claude Code session JSONL files at `~/.claude/projects/**/*.jsonl`, parses every API turn, and tells the user exactly what is costing them money and how to cut it.

The hero use case: a Claude Code user runs `npx ccmeter` in their terminal and within 5 seconds sees:

1. Their daily and monthly spend, broken down by project, by model, by session type
2. Their cache hit rate and a count of cache busts per day, with the dollar cost of those busts
3. A leaderboard of their most expensive sessions, with one-line explanations of why each was expensive
4. Concrete recommendations: "you had 47 cache busts last week from sessions that idled past the 5-minute TTL, costing you $19.30. Here are 3 sessions where this happened."
5. A trend chart showing whether costs are going up or down week over week

This tool exists because Claude Code costs are opaque and the April 2, 2026 cache TTL change made everyone's bills mysteriously go up. Users on r/ClaudeAI have been hand-rolling JSONL parsers to figure out what changed. Ship them the real tool.

The end state of these 7-10 hours: someone runs `npx ccmeter@latest` and immediately sees their numbers. No setup, no config, no API key. They run `npx ccmeter dashboard` and a beautiful local web UI opens at `localhost:7777`. They run `npx ccmeter recommend` and get a personalized list of cost-reduction tactics based on their actual patterns.

## Non-negotiable constraints

- TypeScript strict end to end. Single repo. No monorepo tooling. pnpm or npm, your call. Pick one and stick.
- Distributed as an npm package executable via `npx ccmeter`. Also publishable as a global install with `npm i -g ccmeter`.
- Zero network calls in the default path. The CLI works fully offline. Network is opt-in only for an "update check" that can be disabled.
- Zero credentials required. Everything is read from local JSONL files.
- Storage: no database. Parse JSONLs on demand and cache parsed results in `~/.cache/ccmeter/parsed/{file_hash}.json`. Cache invalidates when the source file's mtime or size changes.
- CLI: built with `commander` or `yargs`. Pretty terminal output via `picocolors`, `cli-table3`, and `cli-progress`. Sparkline charts in the terminal via `asciichart`.
- Web dashboard: a Vite + React + Tailwind v4 SPA served by a tiny Node http server bundled into the same package. No Next.js, no separate dashboard package.
- License: MIT. README written for someone who has never used a Node CLI before.
- Code: every file under 250 lines if possible. Strict TypeScript. Zod schemas for the JSONL turn format and for any shared data types.
- Time-to-first-result on a real user's machine with 6 months of session history must be under 5 seconds for the default `ccmeter` summary command.

## What you are building, in order

8 phases. Do not skip ahead. After each phase produce a working artifact and verify it on actual JSONL data.

### Phase 0: Repo skeleton (15 min)

```
ccmeter/
  package.json
  tsconfig.json
  tsup.config.ts        # bundle CLI + web assets
  .gitignore
  .npmignore
  README.md
  LICENSE
  bin/
    ccmeter.js          # shebang entrypoint
  src/
    cli/
      index.ts
      commands/
        summary.ts
        sessions.ts
        cache.ts
        recommend.ts
        dashboard.ts
        export.ts
        watch.ts
      ui/
        format.ts
        sparkline.ts
        table.ts
    core/
      paths.ts          # locates ~/.claude/projects across platforms
      jsonl/
        reader.ts       # streaming JSONL parser with Zod validation
        schema.ts       # the turn schema
      pricing/
        models.ts       # pricing table per model+region
        compute.ts      # turn -> cost
      analysis/
        sessions.ts     # group turns into sessions
        cache.ts        # cache-bust detection + cost
        trends.ts       # daily/weekly aggregations
        recommend.ts    # rule-based recommendations
      cache/
        store.ts        # parsed-result disk cache
      types.ts
      logger.ts
    web/
      server.ts         # static + json api
      app/
        main.tsx
        App.tsx
        components/
        pages/
        lib/api.ts
      index.html
      vite.config.ts
      tailwind.config.ts
  test/
    fixtures/           # anonymized real JSONLs
    parser.test.ts
    cache.test.ts
    pricing.test.ts
```

Set up TypeScript strict, ESLint, Prettier. `tsup` builds the CLI to `dist/cli.js` with a shebang and bundles the web assets into `dist/web/`. The `bin` field in package.json points at `bin/ccmeter.js` which simply requires the bundled `dist/cli.js`. Vite builds the web SPA into `dist/web/` with a base path of `/`.

Deliverable: `pnpm build` produces `dist/`. Running `node bin/ccmeter.js --help` prints the command list. Running `npm pack` produces a tarball that, when installed elsewhere via `npm i -g ./ccmeter-0.1.0.tgz`, gives a working `ccmeter --help`.

### Phase 1: JSONL discovery and parsing (90 min)

`src/core/paths.ts`:

- Resolves `~/.claude/projects` on macOS, Linux, Windows
- Walks the directory recursively, returns all `.jsonl` files with their full paths and stats
- Exposes `getDefaultLogDir()` and `findSessionFiles()` functions

`src/core/jsonl/schema.ts`:

Define a Zod schema for a Claude Code session turn. Based on the public Anthropic API spec plus what Claude Code actually writes. At minimum capture:

```ts
{
  type: "user" | "assistant" | "tool_use" | "tool_result" | "system" | string,
  timestamp: string | number,
  sessionId: string,
  projectPath: string | undefined,   // some lines may have it
  message: {
    id?: string,
    model?: string,
    role?: "user" | "assistant",
    content?: unknown,
    usage?: {
      input_tokens?: number,
      output_tokens?: number,
      cache_creation_input_tokens?: number,
      cache_read_input_tokens?: number,
      cache_creation?: {
        ephemeral_5m_input_tokens?: number,
        ephemeral_1h_input_tokens?: number
      }
    }
  } | undefined,
  // tolerate extra fields, do not error on unknown keys
}
```

Use `z.passthrough()` and tolerate missing fields. Bad lines are logged at debug level, never crash the run.

`src/core/jsonl/reader.ts`:

- Streams a JSONL file line by line using `readline` and a `fs.createReadStream`
- For each line, JSON.parse, then Zod parse with the lenient schema. Skip and count failures.
- Returns an async iterable of validated turns
- Exposes `parseFile(path)` returning `{ turns: Turn[], errors: ParseError[], stats: ParseStats }`

`src/core/cache/store.ts`:

- Hash the file path + mtime + size as the cache key
- Cache the parsed result to `~/.cache/ccmeter/parsed/{hash}.json.gz` (use zlib gzip for compactness)
- On read, validate the cached result with Zod and return it; on any mismatch, re-parse the source file
- `clear()` and `stats()` helpers

Deliverable: `node -e "import('./dist/core/jsonl/reader.js').then(...)"` parses 10MB of real JSONL data in under 1 second. Re-parsing the same file uses cache and finishes in under 50ms.

### Phase 2: Pricing engine (45 min)

`src/core/pricing/models.ts`:

Hardcode a pricing table for every Claude model that has appeared in Claude Code over the last 18 months. Per million tokens, separated into `input`, `output`, `cache_5m_write`, `cache_1h_write`, `cache_read`. Include at minimum: claude-haiku-4-5, claude-sonnet-4-5, claude-sonnet-4-6, claude-opus-4-5, claude-opus-4-6, claude-opus-4-7, claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus, claude-sonnet-4. If a model id appears in the data that is not in the table, fall back to a `default` entry and emit a one-time warning.

Reference the official Anthropic pricing page for current numbers. Add a comment at the top of the file with the date you last verified pricing, and a TODO to expose pricing overrides via a config file at `~/.config/ccmeter/pricing.json` that takes precedence over the built-in table.

`src/core/pricing/compute.ts`:

Given a turn with `usage`, return a `Cost` object:

```ts
{
  inputCost: number,
  outputCost: number,
  cacheWriteCost: number,
  cacheReadCost: number,
  totalCost: number,
  cacheTier: "5m" | "1h" | "none",
  model: string
}
```

Costs are stored in dollars as floats. Round only on display.

Deliverable: a unit test against a known turn that produces an exact expected cost.

### Phase 3: Session and cache analysis (60 min)

`src/core/analysis/sessions.ts`:

Group turns by `sessionId`. For each session, compute:

- start time, end time, duration
- project path (best-guess from cwd hints in turns or filename)
- total cost broken down by category
- turn count, tool-use count, model used (or models if mixed)
- a "shape" classification: `interactive` (turns spaced under 90s), `agentic` (long backgrounded tool calls), `mixed`

`src/core/analysis/cache.ts`:

This is the core feature. Detect cache busts:

- A turn is a cache write if `cache_creation_input_tokens > 0`. It is a read if `cache_read_input_tokens > 0`.
- Within a session, a "cache bust" is a write that follows a previous write or read in the same session, where the gap since the previous turn exceeds the cache's TTL (300 seconds for 5m tier, 3600 for 1h tier as of April 2, 2026).
- For each cache bust, compute the "wasted spend" as the cost of the cache write minus what a cache read on equivalent input would have cost.
- Aggregate: busts per day, total bust cost per day, top sessions by bust cost.

`src/core/analysis/trends.ts`:

Aggregate by day, week, month. Produce time series for: total cost, cache hit ratio, busts, total turns, distinct sessions, average session cost.

`src/core/analysis/recommend.ts`:

Rule-based recommendations. Each rule takes the parsed analysis and returns zero or more `Recommendation` objects with a `severity`, `title`, `body`, `estimatedMonthlySavings`, and `evidence` (links to specific session ids and timestamps). Initial rules:

1. "You hit cache busts X times last week from idle sessions. Consider running `/compact` before stepping away or using `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` if your context is consistently under 200k."
2. "You ran N sessions with >50k tokens of input that produced <200 tokens of output. These look like exploratory queries; smaller targeted prompts would have cost X% less."
3. "Your average session length is N hours and your cache hit rate is M%. Sessions over 90 minutes lose cache value rapidly under the 5m TTL."
4. "You are running model X for Y% of your turns where model Z (cheaper) would likely have sufficed (heuristic: turns where output_tokens < 500 and no tool use)."
5. "Project P accounts for K% of your spend with N% of your sessions. Consider whether work in P justifies the cost or whether prompts there can be tightened."
6. "You had X duplicate or near-duplicate sessions started within 30 minutes of each other. Each restart paid the full input price for context that was already cached in the previous session."

Deliverable: running the analysis on real JSONL data produces sensible numbers and at least 2-3 of the recommendations fire on a typical heavy user's history.

### Phase 4: CLI commands (90 min)

Implement these commands. Default invocation `ccmeter` runs `summary`.

`ccmeter summary [--days N] [--project P]`:

A single-screen overview:

- Header: total spend last N days (default 30), cost-per-day average, cost trend arrow vs prior period
- Mini ASCII sparkline of daily cost
- Table: spend by model
- Table: spend by project (top 10)
- Cache stats: hit rate %, total busts, $ wasted on busts
- Footer: "Run `ccmeter recommend` for personalized suggestions" and "Run `ccmeter dashboard` for the full UI"

Format costs as `$12.34`. Format token counts with commas. Color: red for cost increases, green for decreases, yellow for warnings.

`ccmeter sessions [--top N] [--sort cost|duration|busts] [--project P]`:

A scrollable table of sessions, top N by chosen sort key. Columns: date, project, duration, model, turns, cost, busts, shape. Tail with "showing N of M total."

`ccmeter cache [--days N]`:

A focused cache-efficiency view:

- Cache hit rate over time (sparkline)
- Cache bust count over time
- Estimated monthly cost from busts at current run rate
- Top 10 sessions by bust cost with their start time, project, and the timestamp of each bust within them
- A clear "what changed on April 2, 2026" callout if the user's data spans that date and shows the post-April pattern

`ccmeter recommend`:

Print all firing recommendations sorted by `estimatedMonthlySavings` descending. For each, show the title, body, estimated savings, and a list of evidence sessions with timestamps. Use color and indentation, not bullet points.

`ccmeter dashboard [--port 7777]`:

Starts the web server (phase 6) and opens the browser. Stays in foreground until Ctrl-C. Streams a live-tail of new turns into the dashboard via SSE.

`ccmeter export [--format json|csv|md] [--out PATH]`:

Dumps the parsed analysis. JSON is the canonical format, CSV is per-session, markdown is a human-readable report suitable for sharing on Reddit or Twitter (with sensitive paths redacted by default; opt-in via `--no-redact`).

`ccmeter watch`:

Tails `~/.claude/projects` for new lines, reparses incrementally, prints a live-updating one-line "today: $X / N sessions / M turns / busts: K" status bar.

Deliverable: every command runs on real data and produces useful output. `ccmeter` with no args takes under 5 seconds on 6 months of history.

### Phase 5: Web server (30 min)

`src/web/server.ts`:

A tiny Node HTTP server (`http` module, not Express, not Fastify) that:

- Serves the bundled SPA assets from `dist/web/`
- Exposes JSON endpoints under `/api/*`:
  - `GET /api/summary?days=N`
  - `GET /api/sessions?sort=&top=&project=`
  - `GET /api/sessions/:id` returns the full session detail including per-turn cost
  - `GET /api/cache?days=N`
  - `GET /api/recommendations`
  - `GET /api/trends?bucket=day|week`
  - `GET /api/events` SSE stream that emits new-turn events as JSONLs are appended
- Binds to `127.0.0.1` only. Refuses non-localhost connections.
- Generates a random bearer token on startup printed to stdout. Web UI is served with the token baked into the index.html, so opening from the same machine works seamlessly.

Deliverable: `ccmeter dashboard --port 7777` starts the server and prints the URL. `curl http://127.0.0.1:7777/api/summary` returns valid JSON. External-IP requests are rejected.

### Phase 6: Dashboard SPA (90 min)

Vite + React 19 + Tailwind v4 + TanStack Query + Recharts + lucide-react.

Pages:

- `/` Overview: 4 KPI cards (last 30 days spend, cache hit rate, active projects, recommendations count), spend-over-time line chart, model breakdown donut, top projects bar chart, latest 10 sessions table
- `/sessions` Full sortable, filterable table of sessions. Click a row → detail page with per-turn cost breakdown and a cache-bust timeline visualization
- `/cache` Cache analysis page. Big number for last-7-days bust cost. Time series line chart of cache hit rate. Calendar heatmap of busts by day. Annotation marker on April 2, 2026 if visible in the data.
- `/recommendations` Cards for each firing recommendation with the evidence table inline, expandable
- `/settings` Pricing override editor (writes to `~/.config/ccmeter/pricing.json`), cache-clear button, log directory override

Style: dense but readable, monospace for numbers, system font for prose. Dark by default with a light toggle. No animations beyond a subtle fade on data updates.

The SSE feed updates the overview KPIs in real time when the user keeps Claude Code running in another window.

Deliverable: dashboard works, looks clean, every page loads in under 200ms after the initial server start.

### Phase 7: Privacy, packaging, polish, README (45 min)

Privacy:

- Default redaction of project paths in any export (`/Users/foo/work/project-x` becomes `~/work/<redacted>`). Opt-in with `--no-redact`.
- A clear startup message on first run: "ccmeter reads only files under ~/.claude/projects. It makes zero network calls by default. Run with --help to see all options."
- Add a `--check-privacy` command that prints exactly what files would be read and confirms no network calls would be made.

Packaging:

- The published npm package must work via `npx ccmeter` with no global install.
- Publish under a clear name. If `ccmeter` is taken on npm, use `cc-meter` or `claudecode-meter`. Verify before phase 7 ends.
- Add a GitHub Actions workflow that runs tests and publishes on tag push.

Polish:

- A 30-second cast.gif in the README showing `ccmeter` then `ccmeter dashboard` on a real account
- Pretty error messages: if `~/.claude/projects` does not exist, explain that the user might not have Claude Code installed or that their logs are stored elsewhere, and tell them how to set `CCMETER_LOG_DIR`
- An `update` notifier that checks npm for newer versions only when explicitly opted in via `--check-updates` or `CCMETER_CHECK_UPDATES=1`

README structure:

- One-sentence pitch above the fold, followed by the cast.gif
- "Why" section: explain the April 2 cache TTL change and why everyone's bills jumped, link to the r/ClaudeAI thread
- Quickstart: `npx ccmeter`
- Commands: one-line description of each
- Screenshots of the dashboard
- Privacy section: explicit, unambiguous, what is read, what is not, what is sent
- "How it works" architecture diagram in mermaid
- FAQ: "is this safe", "does this send my code anywhere" (no), "how do I update pricing", "does it work with the Claude Code beta logs", "can I use this with the Claude Code Pro subscription instead of the API" (yes, both work, the JSONL format is the same)
- Roadmap with 12 features for community contributors: extra recommendation rules, cost-budget alerts via desktop notification, weekly email digest, Slack webhook integration, multi-machine aggregation, model-comparison what-if mode, prompt-engineering quality scoring, etc.
- A clear "contribute a recommendation rule" walkthrough that points to `src/core/analysis/recommend.ts` with a 30-line template

Deliverable: README reads well, repo looks professional, and `npx ccmeter` works end to end from a clean machine.

### Phase 8: Skill version + launch artifacts (30 min)

Build a Claude Code skill version at `skills/ccmeter/SKILL.md`. The skill teaches Claude Code to invoke `npx ccmeter export --format json` on user request and then narrate the analysis in chat. Useful prompts: "how much did I spend last week", "what session was most expensive", "do I have any cache problems". This makes the project useful even to people who never run the dashboard.

Launch artifacts:

- A draft `LAUNCH.md` at the repo root with: the Show HN title, the r/ClaudeAI post body, a Twitter thread of 6 tweets, a short Hacker News comment to leave on the next "Anthropic pricing" front-page post linking to ccmeter, and a 3-line description for the awesome-claude-code list PR
- A clear "submit to skillsmp.com" instruction at the bottom

Deliverable: skill works when copied to `~/.claude/skills/ccmeter/`. All launch artifacts are ready to paste.

## How to behave during this build

This is production code, not a demo.

- Every async function has a try/catch with a useful error message
- Every file read is wrapped in proper error handling for ENOENT, EACCES, etc.
- Every Zod parse failure is logged at debug level and counted, never thrown
- Every CLI command exits with a non-zero code on failure and a single-line useful message on success
- The CLI must never crash on a malformed JSONL line; it must skip and continue
- The CLI must never make a network call without explicit user opt-in
- No console.log in committed code outside of the formatter; use the logger
- Every external dependency must be justified. Prefer Node built-ins.

When you hit a decision that could go two ways, write the tradeoff in a one-line comment and pick the simpler option. Do not ask. Decide and ship.

When the JSONL format inevitably has variations you did not expect, do not bail. Be lenient on input, strict on output. Log the surprise and continue.

## What "done" looks like at hour 10

A repo I can push to GitHub publicly today. The README has a 30-second cast.gif at the top and `npx ccmeter` on the second line. Someone running Claude Code clones it (or just runs npx) and within 10 seconds sees their actual numbers. They tweet it. The Show HN post goes live on a Tuesday at 9am ET. The r/ClaudeAI post links to the Show HN thread. The skill version gets PRed into awesome-claude-code and the SkillsMP marketplace.

Codebase is under 5000 lines including tests and a contributor can read the whole thing in 90 minutes. Every recommendation rule lives in its own 30-line file so PRs adding new rules are trivial.

If you finish early: add a "what-if" mode that lets the user simulate the impact of switching default model, enabling 1m context, or applying various prompt-tightening assumptions. Add a Slack/Discord webhook for daily cost summaries. Add an `--anonymize` mode for users who want to share their full JSON export publicly to compare with others.

Begin with phase 0 now. After each phase, print a status: what you built, what you tested, what you skipped, and what's next.
