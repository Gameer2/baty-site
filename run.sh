#!/usr/bin/env bash
# One-command local launcher for the whole site (hub + math-lab + canvas).
#
# Always use this instead of double-clicking index.html. Canvas is a Vite/React
# app whose JS loads as ES modules, which browsers refuse to run over file:// —
# it needs a real http:// origin, and math-lab/canvas links to each other with
# relative paths that only resolve when served from the repo root.
#
# Usage: ./run.sh [port]   (defaults to 8000)

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-8000}"
URL="http://localhost:$PORT/"

python3 "$DIR/math-lab/note-taker/serve.py" "$PORT" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT

sleep 1

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1
elif command -v open >/dev/null 2>&1; then
  open "$URL"
else
  echo "Open $URL in your browser."
fi

wait "$SERVER_PID"
