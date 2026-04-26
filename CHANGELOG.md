# Changelog

All notable changes to ccmeter will be documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org).

## [Unreleased]

## [0.2.0] — 2026-04-26

### Fixed (critical, blocked launch)

- **Opus 4.x pricing.** Rate was hard-coded at $15/$75 per 1M tokens; the actual published Anthropic rate for every Opus 4.x model is $5/$25. ccmeter would have over-stated Opus spend by ~3× — fixed and verified against multiple secondary sources on 2026-04-26. Cache rates derive from the universal multipliers (5m=1.25×, 1h=2×, read=0.10×).
- **Cache TTL framing.** README, LAUNCH copy, recommendation rule, dashboard callout, and demo dataset all asserted "April 2, 2026" as the TTL change date with "30–200%" cost impact. Real story per [anthropics/claude-code#46829](https://github.com/anthropics/claude-code/issues/46829) and [The Register, Apr 13 2026](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/): rollout was staggered through early March 2026; impact is 30–60% for typical heavy use; Anthropic's official position is the change should not increase costs. All copy now reflects the verified facts.

### Added

- `ccmeter selftest` — diagnostic command that validates the parser & pricing against your real `~/.claude/projects` data. Reports parse-success ratio, presence of usage objects, observed model ids, unknown schema keys, and a redacted sample of turn shapes. `--json` output is formatted to paste directly into a GitHub issue.
- `ccmeter pricing` — print the active pricing table (built-in plus any user overrides). Trust through transparency: when Console numbers don't match, this is the first thing to diff.
- `ccmeter tools` — per-tool cost breakdown answering "which tool ate the budget"; rolls up `tool_use` blocks across sessions and attributes per-turn cost.
- `ccmeter tag <id> <label>` — annotate a session for grouped reporting; persists to `~/.config/ccmeter/tags.json`. Adds `--tag` filter on `ccmeter sessions`. Tags surface as a column.
- `ccmeter share` — Markdown stat-card or SVG suitable for Reddit/Twitter posts. Fully redacted by default; `--fuzzy` rounds to friendly bands like "~$200".
- `ccmeter compare` — week-over-week (or any two-period) deltas across totals, projects, cache hit-rate, busts.
- `ccmeter live` — full-screen ANSI ticker that animates each new turn as it lands. Plays nicely on a recording.
- Dashboard "Tools" page with attributed-cost bars per tool name.
- New API endpoints: `/api/tools`, `/api/tags`.
- Export schema versioning. The exported JSON now includes `schemaVersion: 1`; `ccmeter merge` rejects incompatible majors instead of silently corrupting reports.
- Parser tolerates `usage` at the top level of a turn (older Claude Code shape) and `model` at the top level (subagent traces). Skips known non-session log files: `history.jsonl`, `summary-*.jsonl`, `summary.*.jsonl`.
- Windows project-dir decode heuristic (`C--Users-foo-bar` → `C:\Users\foo\bar`).
- Switched primary CLI build to `tsc` for readable per-file source maps and zero-bundle distribution; `tsup` config retained for advanced single-bundle builds. Vite `emptyOutDir` is now opt-in to support read-only or sandboxed filesystems.
- Code-split the dashboard bundle. Recharts ships in its own ~340 KB chunk so the main page paints from a 250 KB bundle (gzip 77 KB).

### Added (tests)

- pricing: explicit assertions for Opus 4.x ($5/$25), Claude 3 Opus legacy ($15/$75), and the top-level-`usage` fallback
- paths: POSIX + Windows decode heuristic
- tools: rollup correctness across sessions
- tags: round-trip read/write/delete + applyTags decoration

## [0.1.0] — 2026-04-25

- `ccmeter tools` — per-tool cost breakdown answering "which tool ate the budget"; rolls up tool_use blocks across sessions.
- `ccmeter tag <id> <label>` — annotate a session for grouped reporting; persists to `~/.config/ccmeter/tags.json`. New `--tag` filter on `ccmeter sessions`. Tags also surface in the Sessions table column and `ccmeter tag --list` rolls up per-tag spend.
- `ccmeter share` — Markdown stat-card or SVG suitable for Reddit / Twitter posts. Fully redacted by default; `--fuzzy` rounds to friendly bands like "~$200".
- `ccmeter compare` — week-over-week (or any two-period) deltas across totals, projects, cache hit-rate, busts.
- `ccmeter live` — full-screen ANSI ticker that animates each new turn as it lands. Plays nicely on a recording.
- Dashboard "Tools" page with attributed-cost bars per tool name.
- New API endpoints: `/api/tools`, `/api/tags`.
- Switched primary CLI build to `tsc` for readable per-file source maps and zero-bundle distribution. `tsup` config retained for advanced single-bundle builds.

### Fixed

- Dashboard SPA now reliably loads when `dist/web/server.js` and the bundled SPA assets co-locate after `tsc` compilation (auto-detect with `CCMETER_WEB_DIR` override).
- Vite `emptyOutDir` is now opt-in to support read-only or sandboxed filesystems.

## [0.1.0] — 2026-04-25

Initial release.

### Added

- `ccmeter summary` — one-screen spend overview with sparkline, by-model and top-projects tables.
- `ccmeter sessions` — sortable session leaderboard.
- `ccmeter cache` — cache hit-rate, bust count, $ wasted, April-2 callout when relevant.
- `ccmeter recommend` — twelve rule-based recommendations sorted by est. monthly savings.
- `ccmeter dashboard` — local web UI on `127.0.0.1:7777` with overview / sessions / cache / recommendations / what-if / settings pages.
- `ccmeter export` — JSON, CSV, and Markdown exports with default path redaction and opt-in `--anonymize`.
- `ccmeter watch` — live tail of today's spend.
- `ccmeter whatif` — simulate model swaps and cache scenarios on past data.
- `ccmeter budget` — set & track a monthly budget.
- `ccmeter digest` — POST a weekly digest to a Slack/Discord webhook (opt-in).
- `ccmeter merge` — combine analyses from multiple machines.
- `ccmeter metrics` — Prometheus exposition format.
- `ccmeter prompt` — single-line PS1 badge.
- `ccmeter doctor` / `check-privacy` / `clear-cache` — operational helpers.
- Streaming Zod-validated JSONL parser tolerant to malformed lines.
- Disk cache of parsed results at `~/.cache/ccmeter` (gzipped).
- Pricing table covering Opus / Sonnet / Haiku across 3.x and 4.x families, with override file support at `~/.config/ccmeter/pricing.json`.
- Skill at `skills/ccmeter/SKILL.md` so Claude Code can narrate spend on demand.
