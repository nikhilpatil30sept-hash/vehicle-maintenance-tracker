#!/usr/bin/env bash
#
# Starts the whole CarKeeper stack with one command.
#
#   ./dev.sh          (or: npm run dev)
#
# Bootstraps the Python venv and node_modules on first run, brings the Flask API
# up, waits until it actually answers /health, and only then starts the React dev
# server. Ctrl+C tears both down.

set -euo pipefail
set -m  # job control: each child gets its own process group, so we can kill its subtree

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/venv"
PORT="${PORT:-5001}"
HEALTH_URL="http://localhost:$PORT/health"

RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
CYAN=$'\033[36m'; MAGENTA=$'\033[35m'; DIM=$'\033[2m'; RESET=$'\033[0m'

info()  { printf '%s==>%s %s\n' "$GREEN" "$RESET" "$1"; }
warn()  { printf '%s==>%s %s\n' "$YELLOW" "$RESET" "$1"; }
fatal() { printf '%s==> %s%s\n' "$RED" "$1" "$RESET" >&2; exit 1; }

# Tag each service's output so interleaved logs stay readable. macOS sed has no
# -u (line buffering), so awk+fflush does the prefixing instead.
prefix() {
  awk -v label="$1" -v color="$2" -v reset="$RESET" \
      '{ printf "%s%s%s %s\n", color, label, reset, $0; fflush() }'
}

pids=()
cleanup() {
  trap - INT TERM EXIT
  printf '\n%s==>%s shutting down...\n' "$GREEN" "$RESET"

  # Each service runs in its own process group (set -m), so signal the whole
  # group - CRA in particular spawns children that outlive a bare `kill`.
  for pid in "${pids[@]:-}"; do
    [[ -n "$pid" ]] && kill -TERM -- "-$pid" 2>/dev/null || true
  done

  # Backstop: give them a moment, then hard-kill anything still holding a port.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    lsof -t -i "tcp:$PORT" -i tcp:3000 >/dev/null 2>&1 || break
    sleep 0.5
  done
  local stuck
  stuck="$(lsof -t -i "tcp:$PORT" -i tcp:3000 2>/dev/null || true)"
  if [[ -n "$stuck" ]]; then
    echo "$stuck" | xargs kill -9 2>/dev/null || true
  fi

  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# --- preflight ---------------------------------------------------------------

command -v python3 >/dev/null || fatal "python3 not found on PATH."
command -v npm     >/dev/null || fatal "npm not found on PATH."

if [[ ! -f "$BACKEND/.env" ]]; then
  fatal "backend/.env is missing. Copy backend/.env.example to backend/.env and fill in DATABASE_URL, SECRET_KEY, and GEMINI_API_KEY."
fi

if [[ ! -f "$FRONTEND/.env" ]]; then
  warn "frontend/.env missing - creating one pointed at the local backend."
  printf 'REACT_APP_API_BASE=http://localhost:%s\n' "$PORT" > "$FRONTEND/.env"
fi

if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then
  fatal "Port $PORT is already in use. Stop the other process (lsof -ti tcp:$PORT | xargs kill) or run PORT=xxxx ./dev.sh."
fi

# --- bootstrap ---------------------------------------------------------------

if [[ ! -x "$VENV/bin/python" ]]; then
  info "Creating Python venv..."
  python3 -m venv "$VENV"
fi

# Reinstall only when requirements.txt is newer than the last successful install.
STAMP="$VENV/.requirements.stamp"
if [[ ! -f "$STAMP" || "$BACKEND/requirements.txt" -nt "$STAMP" ]]; then
  info "Installing Python dependencies..."
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet -r "$BACKEND/requirements.txt"
  touch "$STAMP"
fi

if [[ ! -d "$FRONTEND/node_modules" ]]; then
  info "Installing frontend dependencies (first run, this takes a minute)..."
  (cd "$FRONTEND" && npm install --silent)
fi

# --- backend -----------------------------------------------------------------

info "Starting backend on port $PORT..."
(
  cd "$BACKEND"
  exec "$VENV/bin/python" app.py 2>&1 | prefix "[backend] " "$CYAN"
) &
pids+=("$!")

info "Waiting for the API to become ready..."
for i in {1..40}; do
  if curl -sf -m 2 "$HEALTH_URL" >/dev/null 2>&1; then
    info "Backend is up at http://localhost:$PORT"
    break
  fi
  # Bail out early if the backend died instead of silently waiting the full 20s.
  if ! kill -0 "${pids[0]}" 2>/dev/null; then
    fatal "Backend exited during startup. See the [backend] output above."
  fi
  if [[ $i -eq 40 ]]; then
    fatal "Backend did not answer $HEALTH_URL within 20s. Is PostgreSQL running (pg_isready) and DATABASE_URL correct?"
  fi
  sleep 0.5
done

# --- frontend ----------------------------------------------------------------

info "Starting frontend on port 3000..."
printf '%s    the browser will open once React finishes compiling%s\n' "$DIM" "$RESET"
(
  cd "$FRONTEND"
  exec npm start 2>&1 | prefix "[frontend]" "$MAGENTA"
) &
pids+=("$!")

# Exit as soon as either service dies, so a crashed backend doesn't leave a
# frontend running against nothing. Polled rather than `wait -n` because macOS
# still ships bash 3.2, which lacks it.
while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      warn "A service exited - stopping the stack."
      exit 1
    fi
  done
  sleep 1
done
