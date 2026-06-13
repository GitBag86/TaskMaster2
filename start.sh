#!/usr/bin/env sh
set -e

# ---- PostgreSQL readiness wait ----
# If DATABASE_URL points to a remote host, wait up to 60s for it to accept
# connections before running migrations.  For SQLite this is a no-op.
DATABASE_URL="${DATABASE_URL:-}"
if echo "$DATABASE_URL" | grep -qE '^postgres' && command -v python3 >/dev/null 2>&1; then
  echo "Waiting for PostgreSQL at $(echo "$DATABASE_URL" | sed 's/.*@//' | sed 's/\/.*//')..."
  # Pass DATABASE_URL via environment to avoid shell interpolation into Python string
  DB_URL="$DATABASE_URL" python3 -c "
import os, socket, sys, time
from urllib.parse import urlparse

url = urlparse(os.environ['DB_URL'])
host = url.hostname or 'localhost'
port = url.port or 5432

for i in range(30):
    try:
        s = socket.create_connection((host, port), timeout=2)
        s.close()
        print('PostgreSQL is ready.')
        sys.exit(0)
    except (OSError, ConnectionRefusedError):
        if i < 29:
            time.sleep(2)
        else:
            print('ERROR: PostgreSQL did not become ready in 60s')
            sys.exit(1)
"
elif echo "$DATABASE_URL" | grep -qE '^postgres'; then
  # No python3 but we have sh — fallback to simple sleep
  echo "Waiting 10s for PostgreSQL..."
  sleep 10
fi

python -m flask --app app db upgrade

# Gunicorn:
#   --access-logfile - = stdout (widoczny przez docker compose logs)
#   --error-logfile  - = stderr
exec gunicorn \
    --worker-class gthread \
    -w 1 \
    --threads 8 \
    --bind 0.0.0.0:${PORT:-5000} \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    --access-logformat '%(h)s %(m)s %(U)s%(q)s -> %(s)s %(b)sb %(L)ss "%(f)s" "%(a)s"' \
    app:app
