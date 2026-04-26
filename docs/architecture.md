# Architecture

A walkthrough for someone reading the codebase for the first time.

## One-line summary

ccmeter is a streaming JSONL parser → priced-turn computer → session aggregator → rule-based recommender, exposed as a CLI and a localhost web dashboard.

## Data flow

```
~/.claude/projects/**/*.jsonl
            │
            ▼
     ┌──────────────┐
     │  loader.ts   │  enumerate → check disk cache → parse misses
     └──────┬───────┘
            ▼
     ┌──────────────┐
     │ jsonl/reader │  streaming, lenient Zod, tolerant of malformed lines
     └──────┬───────┘
            ▼
     ┌──────────────┐
     │ pricing/     │  per-turn cost from public pricing table
     └──────┬───────┘
            ▼
     ┌──────────────┐
     │ analysis/    │  sessionize, cache-bust detect, daily/project/model agg
     └──────┬───────┘
            ▼
     ┌──────────────┐
     │ recommend/   │  twelve rules → ranked Recommendation[] 
     └──────┬───────┘
            ▼
     Analysis object → CLI tables / SPA / JSON export
```

## Key design choices

**Streaming, not in-memory.** The parser is line-by-line because a single user's JSONL history can be 200+ MB after a few months. Memory is bounded.

**Lenient input, strict output.** The Zod schema uses `passthrough()` and makes every field optional. Field names and shapes have shifted across Claude Code releases. The parser refuses to crash on a malformed line — it counts the error and continues. Downstream consumers see only validated `Turn` objects.

**Disk cache keyed by (path, mtime, size).** Re-running ccmeter on a corpus where 95% of files haven't changed should be ~50 ms. Cache lives at `~/.cache/ccmeter/parsed/` as gzipped JSON. Invalidation is automatic — any source-file change → key change → cache miss.

**Costs are floats, rounded only on display.** ccmeter never rounds intermediate values. Sums-of-rounded-values diverge from rounded-sum-of-values; we always do the latter.

**Localhost-only dashboard.** The HTTP server binds to `127.0.0.1`, refuses non-localhost requests, and requires a per-launch bearer token. There's no auth model beyond "you're already on this machine".

**Recommendations as plain functions.** Each rule is a pure `(Analysis) → Recommendation[]` function in its own file. Trivial to test, trivial to add. Honest savings estimates over hype.

## File-size budget

The whole project is under 5,000 lines. New code that pushes past 250 lines in a single file should be split. The recommendation directory is the canonical example: each rule is one short file.

## What ccmeter is not

- Not a billing system. Numbers are estimates against published pricing.
- Not a multi-tenant service. Single-user, single-machine.
- Not an API client. Reads only what Claude Code already writes.
- Not a permanent daemon. Runs on demand. The dashboard is foreground-only.

## Dependency philosophy

Every dependency must justify its weight on disk and in audit surface. Today:

| dep | why |
| --- | --- |
| `commander` | best-in-class CLI parser |
| `picocolors` | tiny color library, no fancy escapes |
| `cli-table3` | mature, predictable terminal tables |
| `cli-progress` | reserved for long-running parsers (future use) |
| `asciichart` | tiny line-chart renderer, ~200 LOC |
| `zod` | schema validation, ~400 KB, worth it |
| `react`, `vite`, `@tanstack/react-query`, `recharts`, `lucide-react`, `tailwindcss` | dev-deps for the dashboard, not in the runtime CLI bundle |

The runtime install is small. `npx ccmeter` should fetch ≤2 MB of code.
