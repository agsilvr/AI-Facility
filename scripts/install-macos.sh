#!/bin/bash
# Installs the AI Facility as an always-on background service on this Mac.
# Run it from the repository folder, signed in as the Business macOS user:
#
#   ./scripts/install-macos.sh            # runs while the Business user is logged in
#   ./scripts/install-macos.sh --at-boot  # runs from startup, even before anyone logs in (asks for an admin password)
#
# Re-running it is safe: it rebuilds and restarts the service.
set -euo pipefail

LABEL="com.aifacility.server"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
AT_BOOT=false
[[ "${1:-}" == "--at-boot" ]] && AT_BOOT=true

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

echo "Waiting for the facility to start..."
for _ in $(seq 1 20); do
  if curl -fs http://localhost:8787/api/health >/dev/null; then
    echo "AI Facility is running: http://localhost:8787"
    echo "Logs: $LOG_DIR/server.log"
    exit 0
  fi
  sleep 1
done
echo "The service didn't answer yet. Check $LOG_DIR/server.log"
exit 1
