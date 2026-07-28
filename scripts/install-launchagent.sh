#!/usr/bin/env bash
# Install a LaunchAgent that starts Agent Deck at login and opens the UI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.ctt062.agent-deck"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs/agent-deck"
ENV_FILE="$ROOT/.env"
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

# Default: LAN-capable so phone can open the same always-on server.
HOST_VALUE="${HOST:-0.0.0.0}"
PORT_VALUE="${PORT:-3847}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  # Export only simple KEY=VALUE lines for LaunchAgent env
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
    fi
  done <"$ENV_FILE"
  set +a
  HOST_VALUE="${HOST:-$HOST_VALUE}"
  PORT_VALUE="${PORT:-$PORT_VALUE}"
fi

# Build EnvironmentVariables dict entries from .env (safe subset)
ENV_XML=""
ENV_XML+="    <key>PATH</key>\n    <string>${LAUNCH_PATH}</string>\n"
ENV_XML+="    <key>HOST</key>\n    <string>${HOST_VALUE}</string>\n"
ENV_XML+="    <key>PORT</key>\n    <string>${PORT_VALUE}</string>\n"
if [[ -n "${GOOGLE_CLIENT_ID:-}" ]]; then
  ENV_XML+="    <key>GOOGLE_CLIENT_ID</key>\n    <string>${GOOGLE_CLIENT_ID}</string>\n"
fi
if [[ -n "${ALLOWED_EMAILS:-}" ]]; then
  ENV_XML+="    <key>ALLOWED_EMAILS</key>\n    <string>${ALLOWED_EMAILS}</string>\n"
fi
if [[ -n "${SESSION_SECRET:-}" ]]; then
  ENV_XML+="    <key>SESSION_SECRET</key>\n    <string>${SESSION_SECRET}</string>\n"
fi

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
$(printf '%b' "$ENV_XML")
  </dict>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true

# Give the server a moment, then open the UI.
sleep 2
"$OPEN_BIN" "http://127.0.0.1:${PORT_VALUE}" >/dev/null 2>&1 || true

echo "Installed ${PLIST}"
echo "Agent Deck starts automatically at login."
echo "Open http://127.0.0.1:${PORT_VALUE} (sign in with Google)."
if [[ "$HOST_VALUE" == "0.0.0.0" || "$HOST_VALUE" == "::" ]]; then
  echo "LAN/phone: same Wi-Fi devices can use this Mac's IP on port ${PORT_VALUE}."
fi
if [[ -z "${GOOGLE_CLIENT_ID:-}" ]]; then
  echo "Warning: GOOGLE_CLIENT_ID is not set. Add it to ${ENV_FILE} then re-run npm run setup."
fi
echo "Logs: ${LOG_DIR}"
echo "Uninstall: npm run launchagent:uninstall"
