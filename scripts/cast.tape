# ccmeter README hero cast — 30s.
#
# Run with:
#   brew install vhs
#   cd ~/Downloads/Projects/CCmeter
#   vhs scripts/cast.tape          # produces docs/cast.gif
#
# Adjust pacing with the Sleep lines. Final gif is around 1–3 MB at this size.

Output docs/cast.gif

# Look + size — 1200x720 fits the README hero image cleanly on GitHub.
Set FontSize       16
Set Width          1200
Set Height         720
Set Padding        24
Set Theme          "Dracula"
Set TypingSpeed    40ms
Set PlaybackSpeed  1.0

# Quiet prompt; no PS1 noise.
Hide
Type "export PS1='$ '"
Enter
Type "clear"
Enter
Show

# 1. Default summary — the headline screen.
Type "ccmeter --anonymize"
Sleep 600ms
Enter
Sleep 7s

# 2. Cache page — surfaces the early-March 2026 TTL rollout in your data.
Type "clear"
Enter
Sleep 200ms
Type "ccmeter --anonymize cache"
Enter
Sleep 7s

# 3. Recommendations — the actionable wins, ranked by $/mo saved.
Type "clear"
Enter
Sleep 200ms
Type "ccmeter --anonymize recommend"
Enter
Sleep 9s

# 4. Final beat: tease the dashboard. We don't actually open it in the gif
#    (it's an interactive HTTP server; better as a separate screenshot).
Type "clear"
Enter
Sleep 200ms
Type "# and `ccmeter dashboard` opens a local UI ↓"
Enter
Sleep 200ms
Type "ccmeter dashboard --help"
Enter
Sleep 4s
