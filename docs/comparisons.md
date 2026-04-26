# How ccmeter compares

A short, honest comparison to other tools people might pick up for the same job. Updated as the space moves.

## ccmeter vs the Anthropic Console

The Console is the source of truth for billing. ccmeter is the source of truth for *why* the bill looks the way it does. The Console doesn't break costs down by session, project, model, or cache-bust event — ccmeter does, and it's free, and it runs against data you already have.

If the Console says one number and ccmeter says a different one, the Console is right (it's reading the same database that's invoicing you). ccmeter approximates against the public pricing table; small drifts are expected and you can override pricing locally if needed.

## ccmeter vs `claude-usage` (the npm package)

`claude-usage` (and similar single-purpose scripts) prints a cost summary. ccmeter is roughly an order of magnitude bigger in scope: cache-bust detection, sessionization, recommendations, a dashboard, exports, what-if simulation, webhooks. Use `claude-usage` if you only want a one-line spend; use ccmeter if you want to fix the underlying patterns.

## ccmeter vs writing your own JSONL parser

That works! The reason this project exists is that several thousand people independently wrote a partial version. The JSONL format has variations (legacy field names, new structured `cache_creation` shape, occasional bad lines from interrupted writes) — ccmeter has paid the parsing-leniency tax for you.

## ccmeter vs an Anthropic /v1/usage integration

`/v1/usage` is the right answer for org-level reporting and for users on the API plan rather than the subscription. ccmeter complements: it works for both API and subscription users, doesn't need an API key, and gives you a per-session breakdown the org-level usage endpoint does not. A future version of ccmeter will reconcile against /v1/usage when an API key is provided.

## ccmeter vs a hosted dashboard SaaS

A hosted dashboard would be easier to build *for the vendor* but worse on every dimension users care about: it requires uploading your session logs (which contain real prompts and code), it costs money, it has telemetry, and it can't run when your machine is offline. ccmeter is local-first by construction. There's no signup, no account, no upload.
