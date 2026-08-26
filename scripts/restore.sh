#!/bin/bash
# Restores a backup created by backup.sh into the running missy_os_postgres
# container. DESTRUCTIVE - drops and recreates the missy_os database first,
# so this always asks for confirmation before proceeding.
set -euo pipefail

CONTAINER=missy_os_postgres

if [ $# -ne 1 ]; then
    echo "Usage: $0 <path-to-backup.sql.gz>" >&2
    exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: backup file not found: $BACKUP_FILE" >&2
    exit 1
fi

if ! docker exec "$CONTAINER" pg_isready -U missy -d missy_os > /dev/null 2>&1; then
    echo "Error: $CONTAINER is not running or not ready." >&2
    exit 1
fi

echo "This will DROP the current missy_os database and replace it with:"
echo "  $BACKUP_FILE"
read -r -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo "Terminating other connections to missy_os (the app is likely holding some open)..."
docker exec "$CONTAINER" psql -U missy -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'missy_os' AND pid <> pg_backend_pid();"
docker exec "$CONTAINER" psql -U missy -d postgres -c "DROP DATABASE IF EXISTS missy_os;"
docker exec "$CONTAINER" psql -U missy -d postgres -c "CREATE DATABASE missy_os;"
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql -U missy -d missy_os

echo "Restore complete."
