#!/bin/bash
# TaskMaster PostgreSQL Backup Script
# Usage: ./scripts/backup_db.sh [output_dir]
# Designed for Railway cron job or manual use

set -euo pipefail

OUTPUT_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="taskmaster_backup_${TIMESTAMP}.sql.gz"
mkdir -p "$OUTPUT_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

echo "Backing up database to ${OUTPUT_DIR}/${FILENAME}..."
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > "${OUTPUT_DIR}/${FILENAME}"

echo "Backup complete: ${OUTPUT_DIR}/${FILENAME}"
echo "Size: $(du -h "${OUTPUT_DIR}/${FILENAME}" | cut -f1)"
