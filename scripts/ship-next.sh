#!/usr/bin/env bash
# scripts/ship-next.sh — release the version currently in package.json.
#
# Use for v0.2.1, v0.2.2, v0.3.0, etc. (Idempotent and version-agnostic.)
#
# Usage:
#   GH_TOKEN=ghp_xxx NPM_TOKEN=npm_xxx bash scripts/ship-next.sh
#
# What it does, given the version in ./package.json (call it $VER):
#   1. Run scripts/release.sh — clean local build, commit, tag v$VER, npm pack.
#   2. Push commits + tags to github.com/vnmoorthy/ccmeter.
#   3. Create a GitHub Release for v$VER (body: the matching CHANGELOG block).
#   4. npm publish the new version.
#   5. Verify with `npm view ccmeter version`.
#   6. Print revoke-the-token reminder.

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
  GH_TOKEN=ghp_xxx NPM_TOKEN=npm_xxx bash scripts/ship-next.sh"
  exit 1
fi

VER=$(node -e "console.log(require('./package.json').version)")
cyan "▶ ship-next: ccmeter v$VER"

cyan "▶ 1/5  Local clean + commit + tag v$VER + npm pack"
bash "$ROOT/scripts/release.sh"

cyan "▶ 2/5  Push to GitHub"
PUSH_URL="https://x-access-token:${GH_TOKEN}@github.com/vnmoorthy/ccmeter.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$PUSH_URL"
else
  git remote add origin "$PUSH_URL"
fi
git push origin main
git push origin "v$VER"
git remote set-url origin "https://github.com/vnmoorthy/ccmeter.git"
green "      ✓ pushed (remote URL sanitized; no token left in .git/config)"

cyan "▶ 3/5  Create GitHub Release v$VER"
# Pull just the matching CHANGELOG block.
RELEASE_BODY=$(awk -v ver="$VER" '
  $0 ~ "^## \\[" ver "\\]" { capture = 1; next }
  capture && $0 ~ "^## \\[" { exit }
  capture { print }
' CHANGELOG.md | python3 -c "import sys,json;print(json.dumps(sys.stdin.read().strip()))")
REL_RESP=$(curl -sS -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/vnmoorthy/ccmeter/releases" \
  -d "{\"tag_name\":\"v$VER\",\"name\":\"ccmeter v$VER\",\"body\":$RELEASE_BODY,\"draft\":false,\"prerelease\":false}")
if echo "$REL_RESP" | grep -q '"html_url"'; then
  green "      ✓ release created"
elif echo "$REL_RESP" | grep -q "already_exists"; then
  yellow "      (release v$VER already exists — continuing)"
else
  yellow "      (release may not have been created. Response: $REL_RESP)"
fi

cyan "▶ 4/5  npm publish"
if [[ -n "${NPM_TOKEN:-}" ]]; then
  TMPRC=$(mktemp /tmp/.npmrc.ccmeter.XXXXXX)
  trap 'rm -f "$TMPRC"' EXIT
  printf "//registry.npmjs.org/:_authToken=%s\n" "$NPM_TOKEN" > "$TMPRC"
  chmod 600 "$TMPRC"
  npm publish --access public --userconfig "$TMPRC"
  rm -f "$TMPRC"
  trap - EXIT
  green "      ✓ published ccmeter@$VER"
else
  yellow "      NPM_TOKEN not set — skipping npm publish."
  yellow "      Run separately:  npm publish --access public"
fi

cyan "▶ 5/5  Verify"
sleep 5
LIVE=$(npm view ccmeter version 2>&1 | tail -1)
if [[ "$LIVE" == "$VER" ]]; then
  green "      ✓ npm view ccmeter version → $LIVE"
else
  yellow "      (registry currently reports $LIVE; CDN may still be propagating — retry in 60s)"
fi

cat <<EOF

$(green "🎉 ccmeter v$VER is live")

  GitHub:  https://github.com/vnmoorthy/ccmeter/releases/tag/v$VER
  npm:     https://www.npmjs.com/package/ccmeter

$(yellow "▶ REVOKE BOTH TOKENS NOW:")

  https://github.com/settings/tokens
  https://www.npmjs.com/settings/vnmoorthy/tokens

EOF
