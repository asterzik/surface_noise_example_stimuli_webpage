#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8002}"
OPEN_BROWSER=1

if ! command -v python3 >/dev/null 2>&1; then
  printf 'Error: python3 is required to serve this website.\n' >&2
  exit 1
fi

URL="http://${HOST}:${PORT}/index.html"

python3 -m http.server "$PORT" --bind "$HOST" &
SERVER_PID="$!"

cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup INT TERM EXIT

sleep 1
if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
  wait "$SERVER_PID"
  exit $?
fi

printf 'Serving website at %s\n' "$URL"
printf 'Press Ctrl-C to stop the server.\n'

if [ "$OPEN_BROWSER" -eq 1 ]; then
  python3 - "$URL" >/dev/null 2>&1 <<'PY' &
import sys
import webbrowser

webbrowser.open(sys.argv[1])
PY
else
  printf 'Open the URL above in a WebGL2-capable browser.\n'
fi

wait "$SERVER_PID"
