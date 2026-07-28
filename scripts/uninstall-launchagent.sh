#!/usr/bin/env bash
# Remove the Agent Deck LaunchAgent.
set -euo pipefail

LABEL="com.ctt062.agent-deck"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "LaunchAgent uninstall is macOS-only." >&2
  exit 1
fi

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
rm -f "$PLIST"
echo "Removed LaunchAgent ${LABEL}"
