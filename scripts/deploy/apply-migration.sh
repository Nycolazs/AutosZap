#!/bin/bash

# Script para aplicar migration do Prisma na produção
set -e

echo "[$(date '+%H:%M:%S')] Aplicando migration do Prisma..."

cd /opt/autozap/backend

# Sourcing .env.production para obter DATABASE_URL
if [ -f /opt/autozap/.env.production ]; then
  export $(cat /opt/autozap/.env.production | grep -v '#' | xargs)
fi

# Aplicar migration
npx prisma migrate deploy

if [ $? -eq 0 ]; then
  echo "[$(date '+%H:%M:%S')] ✓ Migration aplicada com sucesso!"
else
  echo "[$(date '+%H:%M:%S')] ✗ Erro ao aplicar migration"
  exit 1
fi
