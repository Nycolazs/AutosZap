#!/usr/bin/env pwsh

# Script para aplicar migration na produção
param(
    [string]$Host = "178.156.252.137",
    [string]$User = "root",
    [string]$Password = "2029",
    [string]$Command = "cd /opt/autozap/backend && npx prisma migrate deploy"
)

# Instalar plink.exe se não existir (PuTTY tool)
$plink = "C:\Program Files (x86)\PuTTY\plink.exe"

if (-not (Test-Path $plink)) {
    Write-Host "plink.exe não encontrado em $plink"
    Write-Host "Tentando usar ssh direto com stdin..."
    
    # Tentar com ssh e senha via stdin
    $cmd = @"
cd /opt/autozap
git pull origin main
cd /opt/autozap/backend
npx prisma migrate deploy
"@
    
    Write-Host "Executando migration..."
    $cmd | ssh -T root@$Host
    
} else {
    Write-Host "Usando plink para conexão..."
    & $plink -ssh -l $User -pw $Password $Host $Command
}
