#!/usr/bin/env sh
set -e
python -m flask --app app db upgrade
exec gunicorn --worker-class gthread -w 1 --threads 4 --bind 0.0.0.0:$PORT --timeout 120 app:app
