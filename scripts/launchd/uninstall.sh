#!/bin/bash
# Stops and removes the backend/frontend LaunchAgents - after this, nothing
# starts them at login or restarts them on crash; back to running them by
# hand if you need them.
set -euo pipefail

AGENTS_DIR="$HOME/Library/LaunchAgents"
UID_DOMAIN="gui/$(id -u)"

for name in com.missyos.backend com.missyos.frontend; do
    echo "Removing $name..."
    launchctl bootout "$UID_DOMAIN/$name" 2>/dev/null || true
    rm -f "$AGENTS_DIR/$name.plist"
done

echo "Done - both agents stopped and removed."
