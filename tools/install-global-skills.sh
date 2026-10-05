#!/usr/bin/env bash
# Installs this repo's Claude Code skills, agents and claude-seo runtime
# user-wide (~/.claude) so they load in every session, whatever the project.
set -euo pipefail
SRC=$(mktemp -d)
git clone -q --depth 1 https://github.com/grfz9/MCweb "$SRC"
DEST="$HOME/.claude"
mkdir -p "$DEST/skills" "$DEST/agents" "$DEST/vendor"
cp -r "$SRC/.claude/skills/." "$DEST/skills/"
cp -r "$SRC/.claude/agents/." "$DEST/agents/"
cp -r "$SRC/.claude/vendor/." "$DEST/vendor/"
# Skills reference project-relative paths; point them at ~/.claude instead.
grep -rlE '\.claude/(vendor|skills)/' "$DEST/skills" "$DEST/agents" \
  | xargs -r sed -i -E "s#(^|[^.~A-Za-z/])\.claude/(vendor|skills)/#\1$DEST/\2/#g"
rm -rf "$SRC"
echo "Installed $(ls "$DEST/skills" | wc -l) skills into $DEST"
