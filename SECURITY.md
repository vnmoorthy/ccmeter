# Security policy

## Supported versions

The latest minor release on npm is supported. Older versions get security fixes only at maintainers' discretion.

## Reporting a vulnerability

ccmeter runs entirely on your local machine and never makes outbound network calls in default mode, but if you find a security issue we want to know:

- For non-critical issues: open a GitHub issue with the `security` label.
- For critical issues (e.g. a path-traversal in the dashboard server, a way to leak the bearer token, an RCE via a malicious JSONL line): email the maintainers (address in repo profile) with details. Do not file a public issue.

We aim to respond within 72 hours and ship a fix within 14 days for critical reports.

## Threat model

ccmeter assumes:

- The user trusts files under `~/.claude/projects/` (Claude Code wrote them).
- The dashboard server runs on the same machine as the user invoking it.
- The bearer token in the dashboard URL is treated like a session secret.

ccmeter does NOT defend against:

- A malicious user with shell access on the same machine (they can read the token via `ps`).
- A compromised Claude Code that writes pathologically malicious JSONL (the parser is hardened against memory exhaustion but not adversarial bug-hunts).

If your threat model differs, please open a discussion before deploying.
