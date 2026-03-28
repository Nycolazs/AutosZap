#!/usr/bin/env bash
# =============================================================================
# deploy.sh - Deploy oficial do AutosZap via Git
# =============================================================================
# ESTE SCRIPT deve ser executado DIRETAMENTE NO SERVIDOR de producao.
# Nunca edite arquivos de producao manualmente - use sempre este script.
#
# Uso:
#   cd /opt/autozap
#   bash scripts/deploy/deploy.sh [--branch main] [--skip-frontend]
# =============================================================================

set -euo pipefail

REPO_DIR="${DEPLOY_DIR:-/opt/autozap}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.production}"
COMPOSE_FILE="$REPO_DIR/docker-compose.prod.yml"
BRANCH="${BRANCH:-main}"
SKIP_FRONTEND=false
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/autoszap-deploy-$TIMESTAMP.log"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) BRANCH="$2"; shift 2 ;;
    --skip-frontend) SKIP_FRONTEND=true; shift ;;
    *) echo "Argumento desconhecido: $1"; exit 1 ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
die() { log "ERRO: $*"; exit 1; }

backend_container_id() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q backend
}

backend_health_status() {
  local container_id
  container_id="$(backend_container_id)"
  [[ -n "$container_id" ]] || return 1
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null
}

public_health_url() {
  if [[ -n "${BACKEND_PUBLIC_URL:-}" ]]; then
    echo "${BACKEND_PUBLIC_URL%/}/api/health"
    return
  fi

  echo "https://api.autoszap.com/api/health"
}

log "=== AutosZap Deploy - $(date) ==="
log "Branch: $BRANCH | Diretorio: $REPO_DIR"

[[ -d "$REPO_DIR" ]] || die "Diretorio $REPO_DIR nao encontrado."
[[ -f "$ENV_FILE" ]] || die "Arquivo $ENV_FILE nao encontrado. Copie .env.production.example e configure."

cd "$REPO_DIR"

log "Passo 1/5: Atualizando codigo do repositorio..."
git fetch origin "$BRANCH" --depth=1 2>&1 | tee -a "$LOG_FILE"
git reset --hard "origin/$BRANCH" 2>&1 | tee -a "$LOG_FILE"
COMMIT=$(git log --oneline -1)
log "Commit atual: $COMMIT"

gateway_container_id() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q whatsapp-web-gateway
}

gateway_health_status() {
  local container_id
  container_id="$(gateway_container_id)"
  [[ -n "$container_id" ]] || return 1
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null
}

log "Passo 2/5: Rebuilding imagens Docker do backend e gateway QR..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build backend whatsapp-web-gateway 2>&1 | tee -a "$LOG_FILE"

log "Passo 3/5: Reiniciando backend e gateway QR..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans backend whatsapp-web-gateway 2>&1 | tee -a "$LOG_FILE"

HEALTH_URL="$(public_health_url)"
log "Passo 4/5: Aguardando backend e gateway QR ficarem healthy (ate 120s)..."
for i in $(seq 1 24); do
  STATUS="$(backend_health_status || true)"
  GATEWAY_STATUS="$(gateway_health_status || true)"
  if [[ "$STATUS" == "healthy" ]] && [[ "$GATEWAY_STATUS" == "healthy" ]] && curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    log "  Backend e gateway QR healthy; endpoint publico respondendo apos ${i}x5s"
    break
  fi

  if [[ $i -eq 24 ]]; then
    log "Status final do container backend: ${STATUS:-desconhecido}"
    log "Status final do container whatsapp-web-gateway: ${GATEWAY_STATUS:-desconhecido}"
    die "Backend/gateway QR nao ficaram prontos em 120s. Verifique logs: docker compose -f $COMPOSE_FILE logs --tail=120 backend whatsapp-web-gateway"
  fi

  sleep 5
done

log "Passo 5/5: Verificando containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps 2>&1 | tee -a "$LOG_FILE"

log ""
log "=== DEPLOY CONCLUIDO ==========================="
log "Commit: $COMMIT"
log "Log completo: $LOG_FILE"
log "================================================"
