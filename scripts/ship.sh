#!/usr/bin/env bash
# scripts/ship.sh — full launch sequence in one command.
#
# Usage:
#   GH_TOKEN=ghp_xxxxx NPM_TOKEN=npm_xxxxx NPM_USERNAME=your-handle \
#     bash scripts/ship.sh
#
# What this does:
#   1. Run scripts/release.sh (local clean + commit + tag + tarball)
#   2. Verify GH_TOKEN works and figures out who you are on GitHub
#   3. Create github.com/<gh-user>/ccmeter (public, with description + topics)
#   4. git push -u origin main && git push --tags
#   5. Create the v0.2.0 GitHub Release
#   6. (optional, if NPM_TOKEN is set) npm publish via the token, then clean up
#   7. Verify: npx ccmeter@latest --version + open the live URLs
#   8. Print a "REVOKE NOW" reminder with the exact links
#
# Tokens are NEVER written to any file that's tracked by git. The npm token
# goes into a temporary .npmrc in /tmp and is removed after publish.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cyan()  { printf "\033[1;36m%s\033[0m\n" "$1"; }
green() { printf "\033[1;32m%s\033[0m\n" "$1"; }
yellow(){ printf "\033[1;33m%s\033[0m\n" "$1"; }
red()   { printf "\033[1;31m%s\033[0m\n" "$1"; }

# --- Pre-flight ---
if [[ -z "${GH_TOKEN:-}" ]]; then
  red "GH_TOKEN is required.

Run:
  GH_TOKEN=ghp_xxx NPM_TOKEN=npm_xxx NPM_USERNAME=yourhandle bash scripts/ship.sh"
  exit 1
fi

REPO_DESC="Local-first spend & cache-efficiency dashboard for Claude Code. Reads ~/.claude/projects, tells you exactly what's costing you. No telemetry, no API key."
TOPICS_JSON='{"names":["claude-code","anthropic","cli","dashboard","prompt-cache","observability","cost-optimization","llm-tools","developer-tools","typescript"]}'

cyan "▶ 1/8  Local commit + tag + tarball"
bash "$ROOT/scripts/release.sh"

cyan "▶ 2/8  Validate GitHub token"
GH_USER=$(curl -fsS -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/user | python3 -c "import json,sys;print(json.load(sys.stdin)['login'])")
green "      ✓ token belongs to: $GH_USER"

if [[ "$GH_USER" != "vnmoorthy" ]]; then
  yellow "      (note: token user is $GH_USER, README/package.json link to vnmoorthy. Continuing — push will use $GH_USER.)"
fi

cyan "▶ 3/8  Create GitHub repo"
CREATE_RESPONSE=$(curl -sS -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/user/repos \
  -d "$(cat <<JSON
{
  "name": "ccmeter",
  "description": "$REPO_DESC",
  "homepage": "https://www.npmjs.com/package/ccmeter",
  "private": false,
  "has_issues": true,
  "has_projects": false,
  "has_wiki": false,
  "auto_init": false
}
JSON
)")

if echo "$CREATE_RESPONSE" | grep -q '"name"[[:space:]]*:[[:space:]]*"ccmeter"'; then
  green "      ✓ repo created: https://github.com/$GH_USER/ccmeter"
elif echo "$CREATE_RESPONSE" | grep -q "name already exists on this account"; then
  yellow "      (repo already exists; reusing)"
else
  red "      ✗ create failed:"
  echo "$CREATE_RESPONSE"
  exit 1
fi

cyan "▶ 4/8  Set repo topics"
curl -fsS -X PUT \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$GH_USER/ccmeter/topics" \
  -d "$TOPICS_JSON" >/dev/null
green "      ✓ topics set"

cyan "▶ 5/8  Push commits + tags"
# Use the token in-URL only for this push; never write it to .git/config persistently.
PUSH_URL="https://x-access-token:${GH_TOKEN}@github.com/$GH_USER/ccmeter.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$PUSH_URL"
else
  git remote add origin "$PUSH_URL"
fi
git push -u origin main
git push origin --tags
# Replace the URL with the public, token-less form so the token never ends up
# in .git/config on disk.
git remote set-url origin "https://github.com/$GH_USER/ccmeter.git"
green "      ✓ pushed main + tags; remote URL sanitized"

cyan "▶ 6/8  Create GitHub Release v0.2.0"
RELEASE_BODY=$(awk '/^## \[0\.2\.0\]/,/^## \[0\.1\.0\]/' CHANGELOG.md | sed '$d' | python3 -c "import sys,json;print(json.dumps(sys.stdin.read()))")
curl -fsS -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$GH_USER/ccmeter/releases" \
  -d "{\"tag_name\":\"v0.2.0\",\"name\":\"ccmeter v0.2.0\",\"body\":$RELEASE_BODY,\"draft\":false,\"prerelease\":false}" >/dev/null
green "      ✓ release created"

cyan "▶ 7/8  npm publish"
if [[ -n "${NPM_TOKEN:-}" ]]; then
  TMPRC=$(mktemp /tmp/.npmrc.ccmeter.XXXXXX)
  trap 'rm -f "$TMPRC"' EXIT
  printf "//registry.npmjs.org/:_authToken=%s\n" "$NPM_TOKEN" > "$TMPRC"
  chmod 600 "$TMPRC"
  npm publish --access public --userconfig "$TMPRC"
  rm -f "$TMPRC"
  trap - EXIT
  green "      ✓ published to npm"
else
  yellow "      (NPM_TOKEN not set — skipping. To publish later:
        npm login
        npm publish --access public)"
fi

cyan "▶ 8/8  Verify"
sleep 3
if [[ -n "${NPM_TOKEN:-}" ]]; then
  V=$(npx -y ccmeter@latest --version 2>&1 | tail -1)
  if [[ "$V" == "0.2.0" ]]; then
    green "      ✓ npx ccmeter@latest --version → 0.2.0"
  else
    yellow "      (npx returned: $V — npm registry may still be propagating; retry in a minute)"
  fi
fi

cat <<EOF

$(green "🎉 ccmeter v0.2.0 is live")

  GitHub:  https://github.com/$GH_USER/ccmeter
  Release: https://github.com/$GH_USER/ccmeter/releases/tag/v0.2.0
EOF
if [[ -n "${NPM_TOKEN:-}" ]]; then
cat <<EOF
  npm:     https://www.npmjs.com/package/ccmeter
EOF
fi

cat <<EOF

$(yellow "▶ REVOKE THE TOKENS NOW (you don't need them anymore):")

  GitHub: https://github.com/settings/tokens
          → delete the token you used here
  npm:    https://www.npmjs.com/settings/${NPM_USERNAME:-YOUR_NPM_HANDLE}/tokens
          → delete the automation token

When you're ready for Tuesday morning, paste from LAUNCH.md:
  - Show HN body
  - r/ClaudeAI post
  - Twitter thread

Good luck.
EOF
