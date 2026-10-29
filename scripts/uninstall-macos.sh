#!/bin/bash
# Stops the AI Facility service and removes it from startup. Your data stays in
# the facility folder's data/ directory unless you delete it yourself.
set -uo pipefail
LABEL="com.aifacility.server"

AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"
if [[ -f "$AGENT" ]]; then
  launchctl bootout "gui/$(id -u)" "$AGENT" 2>/dev/null
  rm -f "$AGENT"
  echo "Removed the login service."
fi

DAEMON="/Library/LaunchDaemons/$LABEL.plist"
if [[ -f "$DAEMON" ]]; then
  sudo launchctl bootout system "$DAEMON" 2>/dev/null
  sudo rm -f "$DAEMON"
  echo "Removed the startup service."
fi
