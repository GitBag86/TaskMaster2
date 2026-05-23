#!/usr/bin/env sh
set -e

python -m flask --app app db upgrade

# Gunicorn z dwoma logami:
#   --access-logfile - = stdout (widoczny przez `docker compose logs`)
#   --error-logfile  - = stderr
exec gunicorn \
    --worker-class gthread \
    -w 1 \
    --threads 8 \
    --bind 0.0.0.0:${PORT:-5000} \
    --timeout 3600 \
    --access-logfile - \
    --error-logfile - \
    --access-logformat '%(h)s %(m)s %(U)s%(q)s -> %(s)s %(b)sb %(L)ss "%(f)s" "%(a)s"' \
    app:app
