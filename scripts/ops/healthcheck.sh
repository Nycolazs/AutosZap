#!/usr/bin/env bash
# =============================================================================
# healthcheck.sh - Verificacao de saude do ambiente AutosZap
# =============================================================================
# Uso: bash scripts/ops/healthcheck.sh
# =============================================================================

set -uo pipefail

REPO_DIR="${DEPLOY_DIR:-/opt/autozap}"
COMPOSE_FILE="$REPO_DIR/docker-compose.prod.yml"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.production}"
PUBLIC_HEALTH_URL="${BACKEND_PUBLIC_URL:-https://api.autoszap.com}/api/health"

OK=0
FAIL=0

check() {
  local label="$1"
  local result="$2"

  if [[ "$result" == ok* ]]; then
    echo "  ✓ $label"
    ((OK++)) || true
  else
    echo "  ✗ $label - $result"
    ((FAIL++)) || true
  fi
}

backend_container_id() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q backend
}

backend_health_status() {
  local container_id
  container_id="$(backend_container_id)"
  [[ -n "$container_id" ]] || return 1
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null
}

echo ""
echo "=========================================="
echo " AutosZap Health Check - $(date)"
echo "=========================================="

echo ""
echo "[ Git ]"
if git -C "$REPO_DIR" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  COMMIT=$(git -C "$REPO_DIR" log --oneline -1 2>/dev/null || echo "N/A")
  check "Repositorio Git" "ok"
  echo "    Commit: $COMMIT"
else
  check "Repositorio Git" "nao e um repositorio Git valido"
fi

echo ""
echo "[ Containers Docker ]"
if command -v docker > /dev/null 2>&1; then
  while IFS= read -r line; do
    NAME=$(echo "$line" | awk '{print $1}')
    STATUS=$(echo "$line" | cut -f2-)
    if echo "$STATUS" | grep -qi "up"; then
      check "$NAME" "ok"
    else
      check "$NAME" "$STATUS"
    fi
  done < <(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --format $'{{.Name}}\t{{.Status}}' 2>/dev/null)
else
  check "Docker" "docker nao encontrado"
fi

echo ""
echo "[ API ]"
BACKEND_STATUS="$(backend_health_status || true)"
if [[ "$BACKEND_STATUS" == "healthy" ]]; then
  check "Backend container health" "ok"
  echo "    Status: $BACKEND_STATUS"
else
  check "Backend container health" "${BACKEND_STATUS:-desconhecido}"
fi

if curl -sf "$PUBLIC_HEALTH_URL" > /dev/null 2>&1; then
  HEALTH=$(curl -s "$PUBLIC_HEALTH_URL" 2>/dev/null)
  check "Backend health endpoint" "ok"
  echo "    URL: $PUBLIC_HEALTH_URL"
  echo "    Resposta: $HEALTH"
else
  check "Backend health endpoint" "sem resposta em $PUBLIC_HEALTH_URL"
fi

echo ""
echo "[ Disco ]"
DISK_USE=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
if [[ -n "$DISK_USE" ]]; then
  if [[ "$DISK_USE" -lt 85 ]]; then
    check "Uso de disco (/)" "ok - ${DISK_USE}% utilizado"
  else
    check "Uso de disco (/)" "ATENCAO - ${DISK_USE}% (acima de 85%)"
  fi
fi

echo ""
echo "=========================================="
echo " Resultado: $OK OK / $FAIL FALHAS"
echo "=========================================="
echo ""

[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
