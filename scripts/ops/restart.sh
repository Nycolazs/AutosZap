#!/usr/bin/env bash
# =============================================================================
# restart.sh — Reinicia os serviços sem rebuild
# =============================================================================
# Uso: bash scripts/ops/restart.sh [backend|postgres|redis|all]
# =============================================================================

set -euo pipefail

REPO_DIR="${DEPLOY_DIR:-/opt/autozap}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.production}"
COMPOSE_FILE="$REPO_DIR/docker-compose.prod.yml"
SERVICE="${1:-all}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

cd "$REPO_DIR"

log "Reiniciando serviço: $SERVICE"

if [[ "$SERVICE" == "all" ]]; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart
else
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart "$SERVICE"
fi

log "Serviços reiniciados."
docker compose -f "$COMPOSE_FILE" ps
