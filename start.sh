#!/usr/bin/env sh
set -e
python -m flask --app app db upgrade
exec gunicorn --worker-class gthread -w 1 --threads 8 --bind 0.0.0.0:${PORT:-5000} --timeout 3600 app:app
