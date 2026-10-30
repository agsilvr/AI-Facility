#!/bin/bash
# Installs the AI Facility as an always-on background service on this Mac.
# Run it from the repository folder, signed in as the Business macOS user:
#
#   ./scripts/install-macos.sh            # runs while the Business user is logged in, with the real crew
#   ./scripts/install-macos.sh --demo     # the simulated demo crew instead
#   ./scripts/install-macos.sh --at-boot  # runs from startup, even before anyone logs in (asks for an admin password)
#
# Re-running it is safe: it rebuilds and restarts the service.
set -euo pipefail

LABEL="com.aifacility.server"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
AT_BOOT=false
MODE=live
for arg in "$@"; do
  case "$arg" in
    --at-boot) AT_BOOT=true ;;
    --demo) MODE=demo ;;
  esac
done

[[ "$(uname)" == "Darwin" ]] || { echo "This installer is for macOS."; exit 1; }

NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "Node.js isn't installed. Install the LTS version from https://nodejs.org and run this again."
  exit 1
fi
NODE_VERSION="$("$NODE" -p 'process.versions.node')"
if ! "$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  echo "Node.js $NODE_VERSION is too old. Install version 22.13 or newer from https://nodejs.org."
  exit 1
fi

# The real crew runs Claude Code, signed in to the owner's subscription. A
# background service starts with almost no PATH, so give it the folders where
# node and claude live.
CLAUDE="$(command -v claude || true)"
if [[ "$MODE" == live && -z "$CLAUDE" ]]; then
  echo "Claude Code isn't installed for this user, so writing listings will stop and wait for you until it is."
fi
SERVICE_PATH="$(dirname "$NODE")"
[[ -n "$CLAUDE" ]] && SERVICE_PATH="$SERVICE_PATH:$(dirname "$CLAUDE")"
SERVICE_PATH="$SERVICE_PATH:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"

echo "Building the facility..."
cd "$REPO"
npm ci --no-audit --no-fund
npm run build

# Data and logs stay inside the facility folder. The only file written outside
# it is the service definition macOS needs in ~/Library/LaunchAgents.
LOG_DIR="$REPO/logs"
DATA_DIR="$REPO/data"
mkdir -p "$LOG_DIR" "$DATA_DIR"

plist() {
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--disable-warning=ExperimentalWarning</string>
    <string>$REPO/build/server/main.js</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>FACILITY_DATA_DIR</key><string>$DATA_DIR</string>
    <key>HOME</key><string>$HOME</string>
    <key>PATH</key><string>$SERVICE_PATH</string>
    <key>FACILITY_MODE</key><string>$MODE</string>
  </dict>
  $1
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG_DIR/server.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/server.log</string>
</dict>
</plist>
PLIST
}

if $AT_BOOT; then
  TARGET="/Library/LaunchDaemons/$LABEL.plist"
  plist "<key>UserName</key><string>$(id -un)</string>" | sudo tee "$TARGET" >/dev/null
  sudo chown root:wheel "$TARGET"
  sudo chmod 644 "$TARGET"
  sudo launchctl bootout system "$TARGET" 2>/dev/null || true
  sudo launchctl bootstrap system "$TARGET"
else
  TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
  mkdir -p "$(dirname "$TARGET")"
  plist "" > "$TARGET"
  launchctl bootout "gui/$(id -u)" "$TARGET" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$TARGET"
fi

# Research runs on Qwen in Ollama on this Mac. If Ollama is installed, fetch the
# model now (one time, about 7 GB) so research works from the first job. Ollama
# keeps its models in its own folder; the facility never touches them.
QWEN="${FACILITY_QWEN_MODEL:-qwen3.5:9b}"
if command -v ollama >/dev/null 2>&1; then
  echo "Downloading $QWEN for Ollama (one time, about 7 GB)..."
  ollama pull "$QWEN" || echo "Couldn't download $QWEN yet. Research will wait until it's there; run this installer again later."
else
  echo "Ollama isn't installed yet, so research will wait. Install it from https://ollama.com and run this installer again."
fi

echo "Waiting for the facility to start..."
for _ in $(seq 1 20); do
  if curl -fs http://localhost:8787/api/health >/dev/null; then
    echo "AI Facility is running: http://localhost:8787"
    echo "Logs: $LOG_DIR/server.log"
    # First install: open the one-time page where the owner sets their approval PIN.
    SETUP="$DATA_DIR/owner-setup-link.txt"
    if [[ -f "$SETUP" ]]; then
      echo "Opening the page to set your approval PIN..."
      open "$(head -n 1 "$SETUP")"
    fi
    exit 0
  fi
  sleep 1
done
echo "The service didn't answer yet. Check $LOG_DIR/server.log"
exit 1
