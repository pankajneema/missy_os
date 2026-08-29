#!/bin/bash
# Quick health check: is each agent loaded, what's its PID and last exit
# code, and does its port actually answer.
set -euo pipefail

UID_DOMAIN="gui/$(id -u)"

for name in com.missyos.backend com.missyos.frontend; do
    echo "--- $name ---"
    launchctl print "$UID_DOMAIN/$name" 2>/dev/null | grep -E "state|pid|last exit code" || echo "not loaded"
    echo ""
done

echo "--- HTTP checks ---"
curl -s -o /dev/null -w "backend  (http://localhost:8000/health): %{http_code}\n" http://localhost:8000/health || echo "backend unreachable"
curl -s -o /dev/null -w "frontend (http://localhost:8501):        %{http_code}\n" http://localhost:8501 || echo "frontend unreachable"
