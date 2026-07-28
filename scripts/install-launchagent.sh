#!/usr/bin/env bash
# Install a LaunchAgent that starts Agent Deck at login and opens the UI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.ctt062.agent-deck"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs/agent-deck"
NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"
OPEN_BIN="$(command -v open)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "LaunchAgent install is macOS-only." >&2
  exit 1
fi

if [[ -z "$NODE_BIN" || -z "$NPM_BIN" ]]; then
  echo "node and npm must be on PATH." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

# Prefer a built UI+API serve; build once if dist is missing.
if [[ ! -d "$ROOT/dist" ]]; then
  echo "Building UI (one-time)…"
  (cd "$ROOT" && "$NPM_BIN" run build)
fi

NODE_DIR="$(dirname "$NODE_BIN")"
NPM_DIR="$(dirname "$NPM_BIN")"
LAUNCH_PATH="${NODE_DIR}:${NPM_DIR}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NPM_BIN}</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${LAUNCH_PATH}</string>
  </dict>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true

# Give the server a moment, then open the UI.
sleep 2
"$OPEN_BIN" "http://127.0.0.1:3847" >/dev/null 2>&1 || true

echo "Installed ${PLIST}"
echo "Agent Deck starts at login and stays running on http://127.0.0.1:3847"
echo "Logs: ${LOG_DIR}"
echo "Uninstall: npm run launchagent:uninstall"
