#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy oficial do AutosZap via Git
# =============================================================================
# ESTE SCRIPT deve ser executado DIRETAMENTE NO SERVIDOR de produção.
# Nunca edite arquivos de produção manualmente — use sempre este script.
#
# Uso:
#   cd /opt/autozap
#   bash scripts/deploy/deploy.sh [--branch main] [--skip-frontend]
#
# Variáveis de ambiente esperadas (lidas de .env.production):
#   Todas listadas em .env.production.example
# =============================================================================

set -euo pipefail

# ─── Configurações ───────────────────────────────────────────────────────────
REPO_DIR="${DEPLOY_DIR:-/opt/autozap}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.production}"
COMPOSE_FILE="$REPO_DIR/docker-compose.prod.yml"
BRANCH="${BRANCH:-main}"
SKIP_FRONTEND=false
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/autoszap-deploy-$TIMESTAMP.log"

# ─── Parseamento de argumentos ───────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) BRANCH="$2"; shift 2 ;;
    --skip-frontend) SKIP_FRONTEND=true; shift ;;
    *) echo "Argumento desconhecido: $1"; exit 1 ;;
  esac
done

# ─── Funções utilitárias ─────────────────────────────────────────────────────
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
die() { log "ERRO: $*"; exit 1; }

# ─── Pré-validação ───────────────────────────────────────────────────────────
log "=== AutosZap Deploy — $(date) ==="
log "Branch: $BRANCH | Diretório: $REPO_DIR"

[[ -d "$REPO_DIR" ]] || die "Diretório $REPO_DIR não encontrado."
[[ -f "$ENV_FILE" ]] || die "Arquivo $ENV_FILE não encontrado. Copie .env.production.example e configure."

cd "$REPO_DIR"

# ─── 1. Atualizar código via Git ─────────────────────────────────────────────
log "Passo 1/5: Atualizando código do repositório..."
git fetch origin "$BRANCH" --depth=1 2>&1 | tee -a "$LOG_FILE"
git reset --hard "origin/$BRANCH" 2>&1 | tee -a "$LOG_FILE"
COMMIT=$(git log --oneline -1)
log "Commit atual: $COMMIT"

# ─── 2. Rebuild do backend ───────────────────────────────────────────────────
log "Passo 2/5: Rebuilding imagem Docker do backend..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build backend 2>&1 | tee -a "$LOG_FILE"

# ─── 3. Restart dos serviços ─────────────────────────────────────────────────
log "Passo 3/5: Reiniciando serviços (zero-downtime quando possível)..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps --remove-orphans backend 2>&1 | tee -a "$LOG_FILE"

# ─── 4. Healthcheck ──────────────────────────────────────────────────────────
log "Passo 4/5: Aguardando aplicação subir (até 60s)..."
for i in $(seq 1 12); do
  if curl -sf "http://127.0.0.1:4000/api/health" > /dev/null 2>&1; then
    log "  ✓ Backend respondendo após ${i}×5s"
    break
  fi
  if [[ $i -eq 12 ]]; then
    die "Backend não respondeu após 60s. Verifique logs: docker compose -f $COMPOSE_FILE logs --tail=50 backend"
  fi
  sleep 5
done

# ─── 5. Resumo final ─────────────────────────────────────────────────────────
log "Passo 5/5: Verificando containers..."
docker compose -f "$COMPOSE_FILE" ps 2>&1 | tee -a "$LOG_FILE"

log ""
log "=== DEPLOY CONCLUÍDO ==========================="
log "Commit: $COMMIT"
log "Log completo: $LOG_FILE"
log "================================================"
