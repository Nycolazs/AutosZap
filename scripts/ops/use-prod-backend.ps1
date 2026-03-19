[CmdletBinding()]
param(
  [string]$BackendUrl = 'https://api.autoszap.com'
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$frontendEnvPath = Join-Path $repoRoot 'frontend/.env.local'

if (-not ($BackendUrl -match '^https?://')) {
  throw "BACKEND_URL invalida: '$BackendUrl'. Use um URL completo (http/https)."
}

$content = @(
  '# Arquivo gerado por scripts/ops/use-prod-backend.ps1',
  '# Frontend local apontando para API de producao via /api/proxy',
  "BACKEND_URL=$BackendUrl"
) -join "`n"

Set-Content -Path $frontendEnvPath -Value $content -Encoding utf8

Write-Host "Configuracao aplicada em: $frontendEnvPath"
Write-Host "BACKEND_URL => $BackendUrl"
Write-Host ''
Write-Host 'Proximo passo:'
Write-Host '  cd frontend'
Write-Host '  npm run dev'
