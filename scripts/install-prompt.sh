#!/usr/bin/env bash
# Append a ccmeter cost badge to your shell prompt. Detects bash/zsh/fish.
# Idempotent — won't add the line twice.

set -euo pipefail

LINE_BASH='PS1="[\\$(ccmeter prompt --budget 200 2>/dev/null)] $PS1"'
LINE_ZSH='PROMPT="[\$(ccmeter prompt --budget 200 2>/dev/null)] $PROMPT"'
LINE_FISH='function fish_right_prompt; ccmeter prompt --budget 200 ^/dev/null; end'

target=""
case "${SHELL:-}" in
  *bash) target="$HOME/.bashrc"; line="$LINE_BASH" ;;
  *zsh)  target="$HOME/.zshrc";  line="$LINE_ZSH"  ;;
  *fish) target="$HOME/.config/fish/config.fish"; line="$LINE_FISH" ;;
  *) echo "unsupported shell: $SHELL — paste this into your rc file:"; echo "$LINE_BASH"; exit 0 ;;
esac

if grep -F "ccmeter prompt" "$target" >/dev/null 2>&1; then
  echo "ccmeter prompt already in $target — nothing to do."
  exit 0
fi
mkdir -p "$(dirname "$target")"
echo "" >> "$target"
echo "# added by ccmeter scripts/install-prompt.sh" >> "$target"
echo "$line" >> "$target"
echo "added to $target — open a new shell to see it."
