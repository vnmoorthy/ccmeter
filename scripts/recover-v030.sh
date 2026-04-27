#!/usr/bin/env bash
# scripts/recover-v030.sh
#
# Recovery script after release.sh erroneously wiped .git on its previous run.
# Re-fetches the v0.2.0 history from GitHub, replays the v0.3.0 commit on top
# of it, pushes commits and tags, and creates the GitHub release.
#
# Usage:
#   GH_TOKEN=ghp_xxxxx bash scripts/recover-v030.sh

set -euo pipefail

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "GH_TOKEN env var required."
  echo "Run: GH_TOKEN=ghp_xxx bash scripts/recover-v030.sh"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> 1/6 fetch remote main"
git fetch origin

echo "==> 2/6 reset HEAD to remote main, keep working-tree files"
git reset --mixed origin/main
git branch --set-upstream-to=origin/main main >/dev/null 2>&1 || true

echo "==> 3/6 stage all v0.3 files"
git add .

echo "==> 4/6 commit"
git commit -m "Release ccmeter v0.3.0 - see CHANGELOG.md for details"

echo "==> 5/6 retag v0.3.0 against new commit"
git tag -d v0.3.0 >/dev/null 2>&1 || true
git tag -a v0.3.0 -m "ccmeter v0.3.0"

echo "==> 6/6 push main and tag"
PUSH_URL="https://x-access-token:${GH_TOKEN}@github.com/vnmoorthy/ccmeter.git"
git push "$PUSH_URL" main
git push "$PUSH_URL" v0.3.0

echo "==> creating GitHub Release"
RELEASE_BODY=$(awk '/^## \[0\.3\.0\]/,/^## \[0\.2\.1\]/' CHANGELOG.md | sed '$d' | python3 -c "import json,sys;print(json.dumps(sys.stdin.read().strip()))")
RESP=$(curl -sS -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/vnmoorthy/ccmeter/releases \
  -d "{\"tag_name\":\"v0.3.0\",\"name\":\"ccmeter v0.3.0\",\"body\":$RELEASE_BODY,\"draft\":false,\"prerelease\":false}")
echo "$RESP" | python3 -c "import json,sys;d=json.load(sys.stdin);print('release:', d.get('html_url') or d)"

echo
echo "DONE. Visit: https://github.com/vnmoorthy/ccmeter/releases/tag/v0.3.0"
echo
echo "Now revoke the GitHub token at: https://github.com/settings/tokens"
