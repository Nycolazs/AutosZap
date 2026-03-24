#!/bin/bash
set -e

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting migration in production..."

# Navigate to project directory
cd /opt/autozap

# Update code from GitHub
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pulling latest code from GitHub..."
git pull origin main
if [ $? -ne 0 ]; then
  echo "Failed to pull from GitHub"
  exit 1
fi

# Navigate to backend
cd /opt/autozap/backend

# Run migration using Docker
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Applying migration in database..."
docker exec autozap-backend-1 npx prisma migrate deploy

if [ $? -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ Migration applied successfully!"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Checking migration status..."
  docker exec autozap-backend-1 npx prisma migrate status
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✗ Migration failed"
  exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Migration process completed!"
