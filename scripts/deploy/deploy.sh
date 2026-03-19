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

log "Passo 2/5: Rebuilding imagem Docker do backend..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build backend 2>&1 | tee -a "$LOG_FILE"

log "Passo 3/5: Reiniciando servicos (zero-downtime quando possivel)..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps --remove-orphans backend 2>&1 | tee -a "$LOG_FILE"

HEALTH_URL="$(public_health_url)"
log "Passo 4/5: Aguardando backend ficar healthy e responder em $HEALTH_URL (ate 120s)..."
for i in $(seq 1 24); do
  STATUS="$(backend_health_status || true)"
  if [[ "$STATUS" == "healthy" ]] && curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    log "  Backend healthy e endpoint publico respondendo apos ${i}x5s"
    break
  fi

  if [[ $i -eq 24 ]]; then
    log "Status final do container backend: ${STATUS:-desconhecido}"
    die "Backend nao ficou pronto em 120s. Verifique logs: docker compose -f $COMPOSE_FILE logs --tail=120 backend"
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
