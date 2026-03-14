#!/usr/bin/env bash
# =============================================================================
# rollback.sh — Rollback para commit anterior
# =============================================================================
# Uso:
#   bash scripts/deploy/rollback.sh [COMMIT_SHA]
#
#   Se COMMIT_SHA não for informado, volta para o commit imediatamente anterior.
# =============================================================================

set -euo pipefail

REPO_DIR="${DEPLOY_DIR:-/opt/autozap}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.production}"
COMPOSE_FILE="$REPO_DIR/docker-compose.prod.yml"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/autoszap-rollback-$TIMESTAMP.log"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
die() { log "ERRO: $*"; exit 1; }

COMMIT_SHA="${1:-}"

[[ -d "$REPO_DIR" ]] || die "Diretório $REPO_DIR não encontrado."
[[ -f "$ENV_FILE" ]] || die "Arquivo $ENV_FILE não encontrado."

cd "$REPO_DIR"

log "=== AutosZap Rollback — $(date) ==="

CURRENT=$(git log --oneline -1)
log "Commit atual: $CURRENT"

if [[ -z "$COMMIT_SHA" ]]; then
  COMMIT_SHA=$(git log --oneline -2 | tail -n1 | awk '{print $1}')
  log "Nenhum commit informado — usando anterior: $COMMIT_SHA"
fi

log "Revertendo para: $COMMIT_SHA"
git checkout "$COMMIT_SHA" -- . 2>&1 | tee -a "$LOG_FILE"

log "Rebuilding imagem backend para o commit $COMMIT_SHA..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build backend 2>&1 | tee -a "$LOG_FILE"

log "Reiniciando backend..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps backend 2>&1 | tee -a "$LOG_FILE"

log "Aguardando backend subir..."
for i in $(seq 1 12); do
  if curl -sf "http://127.0.0.1:4000/api/health" > /dev/null 2>&1; then
    log "  ✓ Backend OK após rollback"
    break
  fi
  if [[ $i -eq 12 ]]; then
    die "Backend não respondeu após rollback. Verifique: docker compose -f $COMPOSE_FILE logs --tail=50 backend"
  fi
  sleep 5
done

log ""
log "=== ROLLBACK CONCLUÍDO ========================="
log "Commit anterior: $CURRENT"
log "Commit atual:    $(git log --oneline -1)"
log "Log: $LOG_FILE"
log "================================================"
