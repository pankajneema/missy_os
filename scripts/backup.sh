#!/bin/bash
# Dumps the missy_os Postgres database to a timestamped, gzipped file OUTSIDE
# Docker's own storage - a wiped/reset Docker volume (this happened once
# already) can't take a backup with it if the backup never lived inside
# Docker's data directory in the first place.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/../backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/missy_os_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=14
CONTAINER=missy_os_postgres

mkdir -p "$BACKUP_DIR"

if ! docker exec "$CONTAINER" pg_isready -U missy -d missy_os > /dev/null 2>&1; then
    echo "Error: $CONTAINER is not running or not ready." >&2
    exit 1
fi

docker exec "$CONTAINER" pg_dump -U missy -d missy_os | gzip > "$BACKUP_FILE"

if [ ! -s "$BACKUP_FILE" ]; then
    echo "Error: backup file is empty - something went wrong." >&2
    rm -f "$BACKUP_FILE"
    exit 1
fi

echo "Backup written: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Keep the backup directory from growing forever.
find "$BACKUP_DIR" -name "missy_os_*.sql.gz" -mtime "+$RETENTION_DAYS" -delete

echo "Current backups:"
ls -lh "$BACKUP_DIR"/missy_os_*.sql.gz 2>/dev/null || echo "(none)"
