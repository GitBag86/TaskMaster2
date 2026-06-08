#!/bin/bash
# TaskMaster PostgreSQL Restore Script
# Usage: ./scripts/restore_db.sh <backup_file.sql.gz>

set -euo pipefail

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: File not found: $BACKUP_FILE"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

echo "Restoring database from ${BACKUP_FILE}..."
echo "WARNING: This will overwrite the current database!"
read -p "Are you sure? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Restore cancelled."
  exit 1
fi

gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
echo "Restore complete."
