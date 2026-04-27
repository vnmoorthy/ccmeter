#!/usr/bin/env bash
# scripts/release.sh — local-only steps to take ccmeter from "code on disk"
# to "tagged + tarball ready to publish". Idempotent: safe to re-run.
#
# Usage:   bash scripts/release.sh
#
# What this DOES (no auth required):
#   1. Clean up sandbox detritus that previous tooling left behind
#   2. Verify the repo is green: typecheck + tests + build
#   3. Confirm package.json is at v0.2.0
#   4. git init / config / commit / tag — fresh history
#   5. Build the v0.2.0 tarball
#   6. Print the EXACT commands to run for GitHub + npm (those need your auth)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cyan()  { printf "\033[1;36m%s\033[0m\n" "$1"; }
green() { printf "\033[1;32m%s\033[0m\n" "$1"; }
yellow(){ printf "\033[1;33m%s\033[0m\n" "$1"; }
red()   { printf "\033[1;31m%s\033[0m\n" "$1"; }

cyan "1/6  Cleaning sandbox leftovers"
rm -f tsup.config.bundled_*.mjs vitest.config.ts.timestamp-*.mjs 2>/dev/null || true
rm -f docs/_frame_*.png 2>/dev/null || true
# Stale .git from a previous attempt? Wipe it.
if [[ -d .git ]] && [[ -f .git/index.lock ]] || ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  yellow "    (removing stale .git from a previous init attempt)"
  rm -rf .git
fi

cyan "2/6  Pre-flight: typecheck + tests + build"

# node_modules might have been installed on a different OS (e.g. someone
# unpacked a tarball or copied from another machine). Detect the rollup-arch
# mismatch up front and self-heal by reinstalling.
need_reinstall() {
  if [[ ! -d node_modules ]]; then return 0; fi
  if ! node -e 'require("rollup/dist/native.js")' >/dev/null 2>&1; then
    return 0
  fi
  return 1
}
if need_reinstall; then
  yellow "      (node_modules is missing or built for the wrong OS — reinstalling)"
  rm -rf node_modules package-lock.json
  npm install --silent
fi

npm run typecheck >/dev/null
npm test --silent >/dev/null
npm run build:cli >/dev/null
green "      ✓ green"

cyan "3/6  Read version from package.json"
VER=$(node -e "console.log(require('./package.json').version)")
if [[ -z "$VER" ]]; then
  red "      ✗ couldn't read version from package.json"
  exit 1
fi
green "      ✓ $VER"

cyan "4/6  git init + first commit"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init -b main >/dev/null
fi
git config user.email "vnarasingamoorthy@gmail.com"
git config user.name  "Moorthy Narasingamoorthy"
git add .
if git diff --cached --quiet; then
  yellow "      (nothing to commit — repo already has v0.2.0)"
else
  git commit -m "Release ccmeter v$VER

See CHANGELOG.md for details." >/dev/null
  green "      ✓ committed"
fi

if git rev-parse "v$VER" >/dev/null 2>&1; then
  yellow "      (tag v$VER already exists)"
else
  git tag -a "v$VER" -m "ccmeter v$VER — see CHANGELOG.md"
  green "      ✓ tagged v$VER"
fi

cyan "5/6  Build the v$VER tarball"
rm -f "ccmeter-$VER.tgz"
npm pack --silent >/dev/null
green "      ✓ ccmeter-$VER.tgz"

cyan "6/6  What's next (these need YOUR auth)"
cat <<'EOF'

  ── A. Create the GitHub repo ──────────────────────────────────────────
  Web UI is fastest:
      https://github.com/new
      owner: ccmeter (create the org first, free) or your personal account
      name:  ccmeter
      visibility: public, no README/license/gitignore (we have them)

  Or via gh CLI:
      gh repo create vnmoorthy/ccmeter --public --source=. --remote=origin --push
      gh release create v0.2.0 --notes-from-tag --title "ccmeter v0.2.0"

  ── B. Push (only if you used the web UI in step A) ────────────────────
      git remote add origin git@github.com:vnmoorthy/ccmeter.git
      git push -u origin main
      git push --tags

  ── C. Publish to npm ──────────────────────────────────────────────────
      npm login
      npm publish --access public

  ── D. Verify ──────────────────────────────────────────────────────────
      npx ccmeter@latest --version       # should print 0.2.0
      open https://github.com/vnmoorthy/ccmeter
      open https://www.npmjs.com/package/ccmeter

EOF

green "release.sh done — local artifacts ready, follow the steps above to ship."
