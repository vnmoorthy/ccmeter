# Changelog

All notable changes to ccmeter will be documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org).

## [Unreleased]

## [0.3.2] — 2026-04-28

Patch release for two dashboard bugs caught by `/qa` shortly after 0.3.1
shipped. No CLI changes.

### Fixed

- **Cache tab rendered as a blank page.** `src/web/app/pages/Cache.tsx`
  referenced `showApril2` and `APRIL_2_2026`, which were defined nowhere.
  ReferenceError fired silently on mount and the entire route unmounted to
  empty. Replaced with the constants that the rest of the file already
  uses (`showTtlCallout`, `TTL_ROLLOUT_START`). The chart's TTL-rollout
  reference line now labels correctly (`"TTL rollout"` instead of the
  stale `"Apr 2"`).

  Why this slipped past CI: the project's root `tsconfig.json` excludes
  `src/web/app/**` from typecheck, and Vite's esbuild transform doesn't
  flag undefined identifiers. Tracked as a follow-up to modernize the
  React 19 `JSX.Element` type usage and re-enable web typecheck.

- **Browser back/forward and deep-link bookmarks left the URL desynced
  from the active tab.** `src/web/app/App.tsx` read `window.location.hash`
  once at mount and never installed a listener. Added a `hashchange`
  effect that calls `setTab` when the hash changes externally, with a
  paired `removeEventListener` cleanup.

### Tests

- Added `test/web-regression.test.ts` (4 source-scan tests) that lock in
  both fixes — assert Cache.tsx no longer references the bad identifiers
  and that App.tsx installs the hashchange listener with a setTab call.
  Total now 59 tests, still under one second.

## [0.3.1] — 2026-04-28

Bug-fix release driven by a `/devex-review` of the CLI surface and a `/cso`
security audit. No behavior changes for valid inputs; better errors for invalid
ones; tighter CI/CD supply chain.

### Fixed

- **`ccmeter selftest` reports the wrong version.** `src/cli/commands/selftest.ts:327`
  hardcoded `"0.2.0"` as a fallback, so `selftest` printed an old version even on
  fresh installs. Now imports the canonical `VERSION` constant from
  `src/cli/index.ts`.
- **Unknown subcommands silently ran `summary`.** Typing `ccmeter dahsboard`
  produced a default summary instead of an error. Now prints
  `ccmeter: unknown command 'dahsboard'. Did you mean 'dashboard'?` and exits 1.
  Levenshtein-based did-you-mean across all 27 commands.
- **`--days abc` printed `last NaN days`.** No int validation on numeric flags.
  Added a positive-integer parser (`parsePositiveInt`) on `--days`, `--top`,
  `--bottom`, `--port`, `--interval`, `--quiet`, `--cache-ttl`, `--max-files`,
  `--sample-turns`. Bad input now errors via commander before the command runs.
- **`whatif --swap xyz->abc` returned a confident fake savings number.**
  `parseSwaps` accepted any token because `pricingFor` falls back to default
  pricing for unknown models. Now validates both sides of the swap against
  family aliases (`opus`/`sonnet`/`haiku`) and the built-in pricing table, and
  rejects single-letter prefixes that previously slipped through.
- **`README.md` commands table missing rows.** Added `selftest`, `prompts`,
  `notify`, `reconcile`, `pricing` so the table matches `--help`.

### Security

- **Pinned all GitHub Actions by commit SHA** in `ci.yml` and `release.yml`
  (`actions/checkout`, `actions/setup-node`, `softprops/action-gh-release`).
  Prevents a tag-repoint or namespace-takeover attack from injecting code into
  the release pipeline that handles `NPM_TOKEN`.
- **Added `.github/dependabot.yml`** for `github-actions` (weekly, grouped) and
  `npm` (weekly, dev/prod groups). Keeps SHA pins and dependencies fresh
  automatically.

### Tests

- New `test/cli-validation.test.ts` (20 tests) covers every fix above —
  selftest version, unknown-command rejection, `--days`/`--top` validators,
  `whatif --swap` validation including the single-letter loophole. Total now
  55 tests, still under one second.

## [0.3.0] — 2026-04-26

Seven new features that knock items off the README roadmap. All in-tree;
no new infrastructure required.

### Added

- **`ccmeter prompts`** — per-prompt quality scoring. Ranks every assistant
  turn by output-tokens-per-dollar. The top of the list is high-yield
  prompts (concise input → useful output); the bottom is low-yield (lots
  of cache + input → little output). Use the bottom list for self-coaching.
- **iCal export** — `ccmeter export --format ics` (alias `ical`) emits a
  standards-compliant `.ics` file with one VEVENT per session. Drop into
  Apple Calendar / Google Calendar / Outlook for billable-time tracking.
- **Git-branch auto-tagging** — `ccmeter --auto-tag-git ...` (or env
  `CCMETER_GIT_AUTOTAG=1`) reads `.git/HEAD` from each session's working
  directory and applies a `branch:<name>` tag to non-main sessions. Manual
  tags from `ccmeter tag` always win. Worktrees and detached-HEAD handled.
- **`ccmeter notify`** — desktop budget notifications. One-shot or
  `--watch` polling daemon. macOS `osascript`, Linux `notify-send`,
  Windows toast (best-effort). Threshold and quiet-window are tunable.
  Reads your saved monthly budget from `ccmeter budget`.
- **AI Coach in `ccmeter live`** — rules-based real-time warnings inline
  in the live ticker. Catches: idle-bust imminent (4+ minutes since last
  turn with active cache), 3 consecutive >$0.30 turns (likely loop),
  same tool fired 5+ times in last 10 turns (stuck), >$1 burned in the
  last minute (rate alarm). Each rule is 4 lines; PRs to add more are
  trivial.
- **`ccmeter reconcile`** — diffs ccmeter's local total against
  Anthropic's authoritative `/v1/organizations/usage_report`. Requires
  `ANTHROPIC_API_KEY` in the environment with org-admin scope. Reports
  delta and percentage; flags >15% drift with diagnostic suggestions.
  Defensive about Anthropic's evolving API shape.
- **`python/pyccmeter.py`** — Python companion module. Wraps the CLI's
  JSON export and exposes the analysis as Python dataclasses. Useful
  for piping into pandas / matplotlib / per-team rollups. Single-file,
  no install — copy into your project, `from pyccmeter import load_analysis`.

### Not built (multi-day projects)

The README roadmap also lists items that need infrastructure outside this
repo's scope: native macOS menu-bar app (Xcode + signing + notarization),
VS Code / JetBrains extensions (separate marketplaces), per-team
aggregation server (hosting + auth), anonymized community comparator
(SaaS backend), Go port (separate ecosystem). These remain on the
roadmap but live in companion repos when they ship, not in `ccmeter` core.

## [0.2.1] — 2026-04-26

Cosmetic-only release. No behavioral changes.

### Fixed

- The published `0.2.0` tarball shipped stale Vite hashed assets from previous
  builds (multiple `index-XXXX.js` siblings). The published `index.html`
  always pointed at the current one, so the package worked fine, but the
  tarball was about 500 KB larger than necessary. v0.2.1 ships ~470 KB
  instead of ~948 KB.
- One leftover `↓ Apr 2 cache TTL change` annotation in `docs/hero.svg` that
  the v0.2.0 reframing pass missed. Now reads `↓ Mar 2026 cache TTL rollout`
  to match the rest of the repo.
- `package.json` `repository.url` is now in canonical `git+https://...` form,
  silencing the `npm pkg fix` warning at publish time.

### Changed

- Vite `emptyOutDir` defaults to `true` so future tarballs are slim by
  default. The opt-out is `VITE_EMPTY_OUT=0` for filesystems that can't
  unlink (sandboxed mounts, some CI runners).

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
