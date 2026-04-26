# Recipes

Practical things you can do with ccmeter.

## Show today's spend in your shell prompt

### bash / zsh

Add to `~/.bashrc` or `~/.zshrc`:

```bash
ccmeter_prompt() {
  ccmeter prompt --budget 200 2>/dev/null
}
PS1='\u@\h:\w $(ccmeter_prompt) $ '
```

The badge stays gray under 70% of your daily budget, turns yellow at 70-100%, red over.

### fish

```fish
function fish_right_prompt
  ccmeter prompt --budget 200 2>/dev/null
end
```

## Daily Slack digest

Add to your crontab (run at 9am every weekday):

```cron
0 9 * * 1-5 ccmeter digest --webhook https://hooks.slack.com/services/T.../B.../xxx --days 1
```

## Pre-commit budget check

`.git/hooks/pre-commit`:

```bash
#!/usr/bin/env bash
month=$(date +%Y-%m)
spend=$(ccmeter export --format json --days 30 | jq '.totals.totalCost')
budget=200
if (( $(echo "$spend > $budget" | bc -l) )); then
  echo "ccmeter: month-to-date spend \$$spend exceeds budget \$$budget"
  echo "         consider scoping this PR more tightly"
  read -p "commit anyway? [y/N] " a
  [[ "$a" == "y" ]] || exit 1
fi
```

## Scrape into Grafana

Add a Prometheus scrape job:

```yaml
scrape_configs:
  - job_name: ccmeter
    static_configs:
      - targets: ['localhost:7777']
    metrics_path: /api/metrics
    params:
      t: ['YOUR_TOKEN_FROM_DASHBOARD_LAUNCH']
    scrape_interval: 60s
```

Or run `ccmeter metrics > /var/lib/node_exporter/textfile_collector/ccmeter.prom` from cron.

## Compare your usage with a teammate

Each of you runs:

```bash
ccmeter export --format json --anonymize --out my-report.json
```

Then someone runs:

```bash
ccmeter merge alice.json bob.json carol.json --out team.json
```

The anonymized export hashes paths and session ids — you can share without leaking project names.

## Find your worst session by cost

```bash
ccmeter sessions --top 5 --sort cost
```

## What if I switch from Opus to Sonnet?

```bash
ccmeter whatif --swap opus->sonnet --days 30
```

## Refresh pricing after Anthropic adjusts rates

1. Find the new rates on Anthropic's pricing page.
2. Edit `~/.config/ccmeter/pricing.json` with just the changed models:
   ```json
   { "claude-sonnet-4-6": { "input": 3.5, "output": 17.5 } }
   ```
3. Re-run any ccmeter command. Overrides take precedence; other models stay on built-in.

## Try ccmeter without installing Claude Code

```bash
npx ccmeter --demo
npx ccmeter dashboard --demo
```

`--demo` uses synthetic data with a visible early-March-2026 cache-TTL step-change so you can see what the tool looks like on real data.
