# Contributing to ccmeter

Thanks for considering a contribution! ccmeter is intentionally small (under 5,000 lines) so changes should stay focused and easy to review.

## Setup

```bash
git clone https://github.com/vnmoorthy/ccmeter
cd ccmeter
npm install
npm run dev          # rebuild CLI on save
npm run dev:web      # vite dev server (proxies /api to a running `ccmeter dashboard`)
npm test             # vitest, runs in <2s
npm run typecheck    # strict tsc on the whole project
```

A typical loop: make the change in `src/`, watch tests re-run, smoke-check with `node bin/ccmeter.js …`.

## Where things live

```
src/
  cli/                CLI entrypoint and per-command files
  core/
    jsonl/            Streaming JSONL parser (~150 LOC, the audit-critical piece)
    pricing/          Pricing tables and per-turn cost compute
    analysis/         Sessionization, cache-bust detection, trends, recommendations
    cache/            Disk-backed parsed-result cache
  web/
    server.ts         Localhost http server (no framework, ~250 LOC)
    app/              The dashboard SPA (Vite + React + Tailwind v4)
test/                 Vitest tests + fixture JSONLs
skills/ccmeter/       Claude Code skill that calls the CLI
```

## Easy wins for new contributors

### Add a recommendation rule (~30 lines)

1. Copy `src/core/analysis/recommend/rules/_template.ts` to a new file with a descriptive name.
2. Implement the `Rule` function. Inspect `a.sessions`, `a.daily`, `a.byProject`, `a.byModel`, `a.totals`. Return one or more `Recommendation` objects when your condition fires.
3. Register the rule in `src/core/analysis/recommend/index.ts`.
4. Add a test in `test/recommend.test.ts` that constructs an `Analysis` shape and asserts your rule fires (or doesn't).

Honest savings estimates win. Under-promise, over-deliver.

### Update pricing

`src/core/pricing/models.ts` has a `PRICING_VERIFIED_AT` constant and a builtin table. When Anthropic adjusts pricing, update both. PRs that update pricing are welcome — please link to the source page in the PR description.

### Improve parser leniency

If you find a JSONL line shape ccmeter mis-parses, add a fixture line to `test/fixtures/sample-session.jsonl` and a test asserting it parses cleanly. Then make the parser tolerant.

## Style

- TypeScript strict, ESM. No CommonJS in new files.
- Files under 250 lines where possible. Split helpers out.
- Plain prose comments above non-obvious logic. No JSDoc unless the function is exported and used elsewhere.
- Format with `npm run format` (Prettier). Don't bikeshed.
- Errors: every async function should fail with a useful single-line message. No stack traces in user-facing CLI output unless `--log-level debug`.

## Tests

We use vitest. Tests live under `test/`. Aim to add at least one test for any non-trivial change. Coverage is informative, not gating.

## PR process

1. Fork → branch → PR.
2. CI must be green (typecheck + tests + smoke `--help` on Linux/macOS/Windows × Node 20/22).
3. One reviewer approval. Maintainers will merge once approved.

## Code of conduct

Be kind. Disagree about the substance, not the person. Maintainers reserve the right to lock or moderate threads that drift toward personal attacks.

## License

By contributing you agree that your contributions will be licensed under the MIT License.
