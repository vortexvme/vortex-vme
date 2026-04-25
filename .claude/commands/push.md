Commit all staged and unstaged changes and push to the vortex remote.

Commit message: $ARGUMENTS

Steps (run without asking for confirmation):
1. `git add -A`
2. `git commit -m "$ARGUMENTS"`
3. `git push vortex master:main --force`

Report the result.
