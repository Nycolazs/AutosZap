#!/usr/bin/env bash
# =============================================================================
# check-env.sh — Valida variáveis de ambiente obrigatórias antes do deploy
# =============================================================================
# Uso: bash scripts/ops/check-env.sh [.env.production]
# =============================================================================

set -euo pipefail

ENV_FILE="${1:-/opt/autozap/.env.production}"

[[ -f "$ENV_FILE" ]] || { echo "ERRO: $ENV_FILE não encontrado."; exit 1; }

# Carrega o arquivo de ambiente
set -o allexport
# shellcheck disable=SC1090
source "$ENV_FILE"
set +o allexport

ERRORS=0

require() {
  local key="$1"
  local value="${!key:-}"
  if [[ -z "$value" ]]; then
    echo "  ✗ $key está vazio ou ausente"
    ((ERRORS++)) || true
  elif echo "$value" | grep -qi "^change-me"; then
    echo "  ✗ $key ainda tem valor placeholder ($value)"
    ((ERRORS++)) || true
  else
    echo "  ✓ $key"
  fi
}

echo ""
echo "Verificando variáveis de ambiente em: $ENV_FILE"
echo ""

require "POSTGRES_PASSWORD"
require "FRONTEND_URL"
require "CONTROL_PLANE_DATABASE_URL"
require "DATABASE_URL"
require "TENANT_DATABASE_BASE_URL"
require "TENANT_DATABASE_ADMIN_URL"
require "JWT_ACCESS_SECRET"
require "APP_ENCRYPTION_KEY"
require "AUTOSZAP_BACKEND_HOST"

echo ""
if [[ "$ERRORS" -eq 0 ]]; then
  echo "Todas as variáveis obrigatórias estão configuradas."
  exit 0
else
  echo "ATENÇÃO: $ERRORS variável(is) com problema. Corrija antes do deploy."
  exit 1
fi
