#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────
# TaskMaster2 — Docker health-check integration test
#
# Builds the Docker image, runs a container (SQLite, no Postgres), and
# verifies that /health and /ready respond correctly.
# Exits 0 on success, 1 on failure.
# ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IMAGE_TAG="taskmaster2-healthcheck:test"
CONTAINER_NAME="taskmaster2-healthcheck"
# Use a high port by default to avoid conflicting with local Flask dev server (port 5000).
PORT="${PORT:-15000}"
TIMEOUT_SECONDS="${TIMEOUT:-60}"
INTERVAL_SECONDS=2

# Pre-flight check: ensure Docker is available
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker command not found. Is Docker installed?"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running or current user lacks permissions."
  exit 1
fi

cleanup() {
  echo "==> Cleaning up container..."
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
  # Intentionally keep the image so CI layer caching is preserved.
}
trap cleanup EXIT

echo "==> Building Docker image: $IMAGE_TAG"
cd "$PROJECT_ROOT"
docker build -t "$IMAGE_TAG" . 1>/dev/null
echo "    Build complete."

echo "==> Starting container: $CONTAINER_NAME"
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "$PORT:5000" \
  -e "SECRET_KEY=ci-health-check-secret" \
  -e "FLASK_ENV=production" \
  -e "CORS_ORIGINS=http://localhost:$PORT" \
  -e "SESSION_COOKIE_SECURE=false" \
  -e "ENABLE_SCHEDULER=false" \
  -e "MAIL_SUPPRESS_SEND=true" \
  "$IMAGE_TAG" > /dev/null

echo "==> Waiting for /health to respond (timeout: ${TIMEOUT_SECONDS}s)..."
start_ts=$(date +%s)
while true; do
  now_ts=$(date +%s)
  elapsed=$(( now_ts - start_ts ))
  if [ "$elapsed" -ge "$TIMEOUT_SECONDS" ]; then
    echo "ERROR: Timed out waiting for container to become healthy."
    echo "--- Container logs (last 30 lines) ---"
    docker logs "$CONTAINER_NAME" 2>&1 | tail -30
    exit 1
  fi

  health_code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/health" 2>/dev/null || true)
  if [ "$health_code" = "200" ]; then
    echo "    Container is healthy after ${elapsed}s."
    break
  fi
  sleep "$INTERVAL_SECONDS"
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Health-check tests"
echo "═══════════════════════════════════════════════════════════════"

run_check() {
  local label="$1" url="$2" expected_status="$3" validator_cmd="$4"
  local tmpfile
  tmpfile=$(mktemp)
  local http_code
  http_code=$(curl -s -w "%{http_code}" -o "$tmpfile" "http://127.0.0.1:$PORT$url")
  local body
  body=$(cat "$tmpfile")
  rm -f "$tmpfile"

  echo ""
  echo "  $label"
  echo "     Status: $http_code"
  echo "     Body:   $body"

  if [ "$http_code" != "$expected_status" ]; then
    echo "FAIL: $url returned $http_code, expected $expected_status"
    exit 1
  fi

  if [ -n "$validator_cmd" ]; then
    if ! echo "$body" | python3 -c "$validator_cmd" 2>/dev/null; then
      echo "FAIL: $url body validation failed"
      exit 1
    fi
  fi
  echo "     ✔ ok"
}

# --- /health ---
run_check \
  "1. GET /health" \
  "/health" "200" \
  "import json,sys; d=json.load(sys.stdin); assert d['status']=='healthy'"

# --- /ready ---
run_check \
  "2. GET /ready" \
  "/ready" "200" \
  "import json,sys; d=json.load(sys.stdin); assert d['status']=='ready'; assert d['checks']['database']==True"

# --- /version (bonus) ---
run_check \
  "3. (bonus) GET /version" \
  "/version" "200" \
  "import json,sys; d=json.load(sys.stdin); assert 'version' in d"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  All health-check tests passed.                             "
echo "═══════════════════════════════════════════════════════════════"
