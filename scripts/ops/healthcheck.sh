#!/usr/bin/env bash
# =============================================================================
# healthcheck.sh — Verificação de saúde do ambiente AutosZap
# =============================================================================
# Uso: bash scripts/ops/healthcheck.sh
# =============================================================================

set -uo pipefail

REPO_DIR="${DEPLOY_DIR:-/opt/autozap}"
COMPOSE_FILE="$REPO_DIR/docker-compose.prod.yml"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.production}"

OK=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  if [[ "$result" == "ok" ]]; then
    echo "  ✓ $label"
    ((OK++)) || true
  else
    echo "  ✗ $label — $result"
    ((FAIL++)) || true
  fi
}

echo ""
echo "=========================================="
echo " AutosZap Health Check — $(date)"
echo "=========================================="

# ── Git ────────────────────────────────────────────────────────────────────
echo ""
echo "[ Git ]"
if git -C "$REPO_DIR" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  COMMIT=$(git -C "$REPO_DIR" log --oneline -1 2>/dev/null || echo "N/A")
  check "Repositório Git" "ok"
  echo "    Commit: $COMMIT"
else
  check "Repositório Git" "não é um repositório Git válido"
fi

# ── Docker ─────────────────────────────────────────────────────────────────
echo ""
echo "[ Containers Docker ]"
if command -v docker > /dev/null 2>&1; then
  while IFS= read -r line; do
    NAME=$(echo "$line" | awk '{print $1}')
    STATUS=$(echo "$line" | awk '{print $2}')
    if echo "$STATUS" | grep -q "Up"; then
      check "$NAME" "ok"
    else
      check "$NAME" "$STATUS"
    fi
  done < <(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null | tail -n +2)
else
  check "Docker" "docker não encontrado"
fi

# ── API Backend ────────────────────────────────────────────────────────────
echo ""
echo "[ API ]"
if curl -sf "http://127.0.0.1:4000/api/health" > /dev/null 2>&1; then
  HEALTH=$(curl -s "http://127.0.0.1:4000/api/health" 2>/dev/null)
  check "Backend /api/health" "ok"
  echo "    Resposta: $HEALTH"
else
  check "Backend /api/health" "sem resposta em http://127.0.0.1:4000"
fi

# ── Disco ─────────────────────────────────────────────────────────────────
echo ""
echo "[ Disco ]"
DISK_USE=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
if [[ -n "$DISK_USE" ]]; then
  if [[ "$DISK_USE" -lt 85 ]]; then
    check "Uso de disco (/)" "ok — ${DISK_USE}% utilizado"
  else
    check "Uso de disco (/)" "ATENÇÃO — ${DISK_USE}% (acima de 85%)"
  fi
fi

# ── Resumo ────────────────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo " Resultado: $OK OK / $FAIL FALHAS"
echo "=========================================="
echo ""

[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
