#!/usr/bin/env bash
# =============================================================================
# start-local.sh - Sobe ambiente local (infra + backend + frontend)
# =============================================================================
# Uso: bash scripts/ops/start-local.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$REPO_DIR/.logs/local"
PID_DIR="$REPO_DIR/.pids"

BACKEND_PORT="${BACKEND_PORT:-4000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
WHATSAPP_WEB_GATEWAY_PORT="${WHATSAPP_WEB_GATEWAY_PORT:-3001}"
DATABASE_URL_VALUE="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/autoszap?schema=public}"
REDIS_URL_VALUE="${REDIS_URL:-redis://localhost:6379}"
FRONTEND_URL_VALUE="${FRONTEND_URL:-http://localhost:${FRONTEND_PORT}}"
BACKEND_INTERNAL_BASE_URL_VALUE="${BACKEND_INTERNAL_BASE_URL:-http://127.0.0.1:${BACKEND_PORT}}"
WHATSAPP_WEB_GATEWAY_URL_VALUE="${WHATSAPP_WEB_GATEWAY_URL:-http://127.0.0.1:${WHATSAPP_WEB_GATEWAY_PORT}}"
WHATSAPP_WEB_GATEWAY_SHARED_SECRET_VALUE="${WHATSAPP_WEB_GATEWAY_SHARED_SECRET:-autoszap-local-whatsapp-web-secret}"
WHATSAPP_WEB_GATEWAY_HEADLESS_VALUE="${WHATSAPP_WEB_GATEWAY_HEADLESS:-true}"
WHATSAPP_WEB_GATEWAY_DATA_DIR="${WHATSAPP_WEB_GATEWAY_DATA_DIR:-$REPO_DIR/.data/whatsapp-web-gateway}"
WHATSAPP_WEB_GATEWAY_SESSION_DIR="${WHATSAPP_WEB_GATEWAY_SESSION_DIR:-$WHATSAPP_WEB_GATEWAY_DATA_DIR/sessions}"
WHATSAPP_WEB_GATEWAY_REGISTRY_FILE="${WHATSAPP_WEB_GATEWAY_REGISTRY_FILE:-$WHATSAPP_WEB_GATEWAY_DATA_DIR/registry.json}"

resolve_chromium_path() {
  if [[ -n "${CHROMIUM_PATH:-}" ]]; then
    echo "$CHROMIUM_PATH"
    return 0
  fi

  local candidate
  local static_candidates=(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  )

  for candidate in "${static_candidates[@]}"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  for candidate in \
    "$HOME"/Library/Caches/ms-playwright/chromium-*/chrome-mac*/Google\ Chrome\ for\ Testing.app/Contents/MacOS/Google\ Chrome\ for\ Testing \
    "$HOME"/Library/Caches/ms-playwright/chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium
  do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  for candidate in chromium chromium-browser google-chrome; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done

  echo ""
}

CHROMIUM_PATH_VALUE="$(resolve_chromium_path)"

log() {
  echo "[$(date '+%H:%M:%S')] $*"
}

start_infra() {
  log "Subindo Postgres e Redis via docker compose..."
  if command -v sg >/dev/null 2>&1; then
    sg docker -c "cd \"$REPO_DIR\" && docker compose up -d postgres redis"
  else
    (cd "$REPO_DIR" && docker compose up -d postgres redis)
  fi
}

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  local pid
  pid="$(cat "$pid_file")"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

start_service() {
  local name="$1"
  local workdir="$2"
  local command="$3"
  local log_file="$LOG_DIR/${name}.log"
  local pid_file="$PID_DIR/${name}.pid"

  if is_running "$pid_file"; then
    log "$name ja esta rodando (PID $(cat "$pid_file"))."
    return 0
  fi

  log "Iniciando $name..."
  (
    cd "$workdir"
    nohup bash -lc "$command" >"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )

  sleep 1
  if is_running "$pid_file"; then
    log "$name iniciado com sucesso (PID $(cat "$pid_file"))."
  else
    log "Falha ao iniciar $name. Veja log: $log_file"
    exit 1
  fi
}

wait_backend_health() {
  log "Aguardando backend responder em /api/health..."
  for _ in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
      log "Backend ok em http://localhost:${BACKEND_PORT}/api/health"
      return 0
    fi
    sleep 1
  done

  log "Backend ainda nao respondeu. Verifique: $LOG_DIR/backend.log"
}

wait_gateway_health() {
  log "Aguardando gateway responder em /health..."
  for _ in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:${WHATSAPP_WEB_GATEWAY_PORT}/health" >/dev/null 2>&1; then
      log "Gateway ok em http://localhost:${WHATSAPP_WEB_GATEWAY_PORT}/health"
      return 0
    fi
    sleep 1
  done

  log "Gateway ainda nao respondeu. Verifique: $LOG_DIR/whatsapp-web-gateway.log"
}

mkdir -p "$LOG_DIR" "$PID_DIR"
mkdir -p "$WHATSAPP_WEB_GATEWAY_SESSION_DIR"

log "Diretorio do projeto: $REPO_DIR"
start_infra

if [[ ! -d "$REPO_DIR/node_modules" ]]; then
  log "Instalando dependencias da workspace..."
  (cd "$REPO_DIR" && npm install --no-fund --no-audit)
fi

if [[ ! -d "$REPO_DIR/backend/node_modules" ]]; then
  log "Instalando dependencias do backend..."
  (cd "$REPO_DIR/backend" && npm install --no-fund --no-audit)
fi

if [[ ! -d "$REPO_DIR/frontend/node_modules" ]]; then
  log "Instalando dependencias do frontend..."
  (cd "$REPO_DIR/frontend" && npm install --no-fund --no-audit)
fi

start_service "backend" "$REPO_DIR/backend" "DATABASE_URL='$DATABASE_URL_VALUE' REDIS_URL='$REDIS_URL_VALUE' FRONTEND_URL='$FRONTEND_URL_VALUE' BACKEND_INTERNAL_BASE_URL='$BACKEND_INTERNAL_BASE_URL_VALUE' PORT='$BACKEND_PORT' WHATSAPP_WEB_GATEWAY_URL='$WHATSAPP_WEB_GATEWAY_URL_VALUE' WHATSAPP_WEB_GATEWAY_SHARED_SECRET='$WHATSAPP_WEB_GATEWAY_SHARED_SECRET_VALUE' npm run start:dev"
wait_backend_health

start_service "whatsapp-web-gateway" "$REPO_DIR" "PORT='$WHATSAPP_WEB_GATEWAY_PORT' BIND_HOST='127.0.0.1' GATEWAY_SHARED_SECRET='$WHATSAPP_WEB_GATEWAY_SHARED_SECRET_VALUE' BACKEND_CALLBACK_BASE_URL='$BACKEND_INTERNAL_BASE_URL_VALUE' SESSION_DIR='$WHATSAPP_WEB_GATEWAY_SESSION_DIR' REGISTRY_FILE='$WHATSAPP_WEB_GATEWAY_REGISTRY_FILE' CHROMIUM_PATH='$CHROMIUM_PATH_VALUE' HEADLESS='$WHATSAPP_WEB_GATEWAY_HEADLESS_VALUE' npm run dev:whatsapp-gateway"
wait_gateway_health

start_service "frontend" "$REPO_DIR/frontend" "PORT='$FRONTEND_PORT' npm run dev"

log "Frontend em: http://localhost:${FRONTEND_PORT}"
log "Gateway em: http://localhost:${WHATSAPP_WEB_GATEWAY_PORT}/health"
log "Logs: $LOG_DIR/backend.log, $LOG_DIR/whatsapp-web-gateway.log e $LOG_DIR/frontend.log"
log "Para parar, mate os PIDs em $PID_DIR ou use: pkill -f 'nest start --watch|next dev|tsx watch src/index.ts'"
