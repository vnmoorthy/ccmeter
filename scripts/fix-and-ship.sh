#!/usr/bin/env bash
# scripts/fix-and-ship.sh — recover from the half-finished ship.sh run.
#
# What blocked the first run:
#   1. GitHub repo got created as "CCMeter" (capitals) due to a prior repo
#      with that casing on the account. We rename it to "ccmeter" via API.
#   2. git push was rejected because vnarasingamoorthy@gmail.com is private
#      on your GitHub account. We amend the commit + retag with the GitHub
#      noreply email (looked up via the API).
#
# Then we finish ship.sh's remaining steps: push, GitHub release, optional
# npm publish, verify.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cyan()  { printf "\033[1;36m%s\033[0m\n" "$1"; }
green() { printf "\033[1;32m%s\033[0m\n" "$1"; }
yellow(){ printf "\033[1;33m%s\033[0m\n" "$1"; }
red()   { printf "\033[1;31m%s\033[0m\n" "$1"; }

if [[ -z "${GH_TOKEN:-}" ]]; then
  red "GH_TOKEN env var is required.

Run:
  GH_TOKEN=ghp_xxxxx bash scripts/fix-and-ship.sh
"
  exit 1
fi

cyan "▶ 1/7  Rename repo CCMeter → ccmeter (lowercase, matches all our links)"
RENAME_RESP=$(curl -sS -X PATCH \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/vnmoorthy/CCMeter \
  -d '{"name":"ccmeter"}' 2>&1 || true)
if echo "$RENAME_RESP" | grep -q '"name"[[:space:]]*:[[:space:]]*"ccmeter"'; then
  green "      ✓ renamed"
elif echo "$RENAME_RESP" | grep -qi "Not Found"; then
  yellow "      (CCMeter not found — already at ccmeter? continuing)"
else
  yellow "      (rename may have already happened — continuing)"
fi

cyan "▶ 2/7  Look up your GitHub user id for noreply email"
USER_INFO=$(curl -fsS -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" https://api.github.com/user)
USER_ID=$(echo "$USER_INFO" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")
LOGIN=$(echo "$USER_INFO"   | python3 -c "import json,sys;print(json.load(sys.stdin)['login'])")
NOREPLY="${USER_ID}+${LOGIN}@users.noreply.github.com"
green "      ✓ noreply email: $NOREPLY"

cyan "▶ 3/7  Amend the commit + retag using the noreply email"
git config user.email "$NOREPLY"
git config user.name  "$LOGIN"
# --reset-author rewrites both author and committer of HEAD to the new identity.
git commit --amend --reset-author --no-edit >/dev/null
# Tag must point at the new amended commit.
git tag -d v0.2.0 >/dev/null 2>&1 || true
git tag -a v0.2.0 -m "ccmeter v0.2.0 — see CHANGELOG.md"
green "      ✓ commit + tag rewritten"

cyan "▶ 4/7  Push commits + tags"
PUSH_URL="https://x-access-token:${GH_TOKEN}@github.com/vnmoorthy/ccmeter.git"
git remote set-url origin "$PUSH_URL"
git push -u origin main --force-with-lease
git push origin v0.2.0 --force
git remote set-url origin "https://github.com/vnmoorthy/ccmeter.git"
green "      ✓ pushed; remote URL sanitized"

cyan "▶ 5/7  Create GitHub Release v0.2.0"
RELEASE_BODY=$(awk '/^## \[0\.2\.0\]/,/^## \[0\.1\.0\]/' CHANGELOG.md | sed '$d' | python3 -c "import sys,json;print(json.dumps(sys.stdin.read()))")
REL_RESP=$(curl -sS -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/vnmoorthy/ccmeter/releases" \
  -d "{\"tag_name\":\"v0.2.0\",\"name\":\"ccmeter v0.2.0\",\"body\":$RELEASE_BODY,\"draft\":false,\"prerelease\":false}")
if echo "$REL_RESP" | grep -q '"html_url"'; then
  green "      ✓ release created: $(echo "$REL_RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('html_url',''))")"
elif echo "$REL_RESP" | grep -q "already_exists"; then
  yellow "      (release already exists — continuing)"
else
  yellow "      (release may not have been created. Check on GitHub.)"
fi

cyan "▶ 6/7  npm publish"
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
  yellow "      NPM_TOKEN not set — skipping. To publish later:
        npm login
        npm publish --access public"
fi

cyan "▶ 7/7  Verify"
sleep 3
if [[ -n "${NPM_TOKEN:-}" ]]; then
  V=$(npx -y ccmeter@latest --version 2>&1 | tail -1 || true)
  if [[ "$V" == "0.2.0" ]]; then
    green "      ✓ npx ccmeter@latest --version → 0.2.0"
  else
    yellow "      (npx returned: $V — registry may still be propagating; retry in a minute)"
  fi
fi

cat <<EOF

$(green "🎉 ccmeter v0.2.0 is live")

  GitHub:  https://github.com/vnmoorthy/ccmeter
  Release: https://github.com/vnmoorthy/ccmeter/releases/tag/v0.2.0
EOF
if [[ -n "${NPM_TOKEN:-}" ]]; then
cat <<EOF
  npm:     https://www.npmjs.com/package/ccmeter
EOF
fi

cat <<EOF

$(yellow "▶ REVOKE THE TOKEN NOW (you don't need it anymore):")

  https://github.com/settings/tokens
    → delete the token starting "ghp_AsWxe..."

EOF
