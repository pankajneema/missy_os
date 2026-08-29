#!/bin/bash
# Installs the backend + frontend as macOS LaunchAgents: they'll start at
# login and launchd restarts them automatically if they ever exit, crash,
# or get killed - the supervision that was missing all session (everything
# was started by hand with nohup, and nothing brought a process back after
# it died).
#
# Safe to re-run: bootstrapping an already-loaded agent is a harmless no-op
# error we ignore, not a duplicate process.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_DIR="$HOME/Library/LaunchAgents"
UID_DOMAIN="gui/$(id -u)"

mkdir -p "$AGENTS_DIR"
mkdir -p "$SCRIPT_DIR/../../logs"

for name in com.missyos.backend com.missyos.frontend; do
    echo "Installing $name..."
    cp "$SCRIPT_DIR/$name.plist" "$AGENTS_DIR/$name.plist"

    # bootout first (ignore failure - it's fine if it wasn't loaded), so a
    # re-run picks up a changed plist instead of running the stale one.
    launchctl bootout "$UID_DOMAIN/$name" 2>/dev/null || true
    launchctl bootstrap "$UID_DOMAIN" "$AGENTS_DIR/$name.plist"
    launchctl enable "$UID_DOMAIN/$name"
done

echo ""
echo "Installed. Current status:"
launchctl list | grep missyos || true
echo ""
echo "Logs: $SCRIPT_DIR/../../logs/{backend,frontend}.{out,err}.log"
echo "Check status any time: scripts/launchd/status.sh"
echo "Remove: scripts/launchd/uninstall.sh"
