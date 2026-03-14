param(
  [string]$SshPassword,
  [string]$BackendEnvPath = "backend/.env"
)

$ErrorActionPreference = "Stop"

function Import-DotEnv {
  param([string]$Path)

  $map = @{}
  if (-not (Test-Path $Path)) {
    return $map
  }

  foreach ($line in Get-Content $Path) {
    if (-not $line) { continue }
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }

    $parts = $trimmed.Split("=", 2)
    if ($parts.Length -ne 2) { continue }

    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $map[$key] = $value
  }

  return $map
}

function Get-ConfigValue {
  param(
    [hashtable]$Config,
    [string]$Key,
    [string]$DefaultValue = "",
    [switch]$Required
  )

  $value = $null

  if ($Config.ContainsKey($Key) -and $Config[$Key]) {
    $value = $Config[$Key]
  } elseif (Get-Item "Env:$Key" -ErrorAction SilentlyContinue) {
    $value = (Get-Item "Env:$Key").Value
  } elseif ($DefaultValue) {
    $value = $DefaultValue
  }

  if ($Required -and [string]::IsNullOrWhiteSpace($value)) {
    throw "Configuracao obrigatoria ausente: $Key"
  }

  return $value
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\")).Path
$rootEnvPath = Join-Path $repoRoot ".env"
$opsEnvPath = Join-Path $repoRoot "scripts\ops\.env.ops"

$config = @{}
foreach ($path in @($rootEnvPath, $opsEnvPath)) {
  $loaded = Import-DotEnv -Path $path
  foreach ($k in $loaded.Keys) {
    $config[$k] = $loaded[$k]
  }
}

$sshHost = Get-ConfigValue -Config $config -Key "PROD_SSH_HOST" -Required
$sshUser = Get-ConfigValue -Config $config -Key "PROD_SSH_USER" -DefaultValue "root"
$sshHostKey = Get-ConfigValue -Config $config -Key "PROD_SSH_HOST_KEY" -Required
$localDbPort = [int](Get-ConfigValue -Config $config -Key "PROD_DB_LOCAL_PORT" -DefaultValue "55432")
$remoteDbHost = Get-ConfigValue -Config $config -Key "PROD_DB_REMOTE_HOST" -DefaultValue "127.0.0.1"
$remoteDbPort = [int](Get-ConfigValue -Config $config -Key "PROD_DB_REMOTE_PORT" -DefaultValue "5432")
$prodDatabaseUrl = Get-ConfigValue -Config $config -Key "PROD_DATABASE_URL" -Required

if (-not $SshPassword) {
  $SshPassword = Get-ConfigValue -Config $config -Key "PROD_SSH_PASSWORD"
}
if (-not $SshPassword) {
  $SshPassword = Read-Host "Senha SSH da VPS"
}

$toolsDir = Join-Path $repoRoot ".tools"
$plinkPath = Join-Path $toolsDir "plink.exe"
$backendEnvResolvedPath = Join-Path $repoRoot $BackendEnvPath

if (-not (Test-Path $toolsDir)) {
  New-Item -Path $toolsDir -ItemType Directory | Out-Null
}

if (-not (Test-Path $plinkPath)) {
  Invoke-WebRequest -Uri "https://the.earth.li/~sgtatham/putty/latest/w64/plink.exe" -OutFile $plinkPath
}

try {
  $prodUri = [uri]$prodDatabaseUrl
} catch {
  throw "PROD_DATABASE_URL invalido."
}

if (-not $prodUri.UserInfo) {
  throw "PROD_DATABASE_URL precisa conter usuario e senha."
}

$userInfoParts = $prodUri.UserInfo.Split(":", 2)
if ($userInfoParts.Length -ne 2) {
  throw "PROD_DATABASE_URL precisa conter usuario e senha."
}

$dbUser = [uri]::UnescapeDataString($userInfoParts[0])
$dbPassword = [uri]::UnescapeDataString($userInfoParts[1])
$dbName = $prodUri.AbsolutePath.TrimStart("/")
if (-not $dbName) {
  throw "PROD_DATABASE_URL precisa conter nome do banco."
}

$query = $prodUri.Query
if (-not $query) {
  $query = "?schema=public"
}

$encodedUser = [uri]::EscapeDataString($dbUser)
$encodedPassword = [uri]::EscapeDataString($dbPassword)
$newDatabaseUrl = "postgresql://${encodedUser}:${encodedPassword}@localhost:${localDbPort}/${dbName}${query}"

# Ensure tunnel is active.
$tunnelListening = Get-NetTCPConnection -LocalPort $localDbPort -State Listen -ErrorAction SilentlyContinue
if (-not $tunnelListening) {
  Start-Process $plinkPath -ArgumentList @(
    "-ssh",
    "-N",
    "-batch",
    "-hostkey",
    $sshHostKey,
    "-pw",
    $SshPassword,
    "-L",
    "${localDbPort}:${remoteDbHost}:${remoteDbPort}",
    "${sshUser}@${sshHost}"
  ) -WindowStyle Hidden | Out-Null

  $ready = $false
  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Milliseconds 800
    $check = Get-NetTCPConnection -LocalPort $localDbPort -State Listen -ErrorAction SilentlyContinue
    if ($check) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw "Tunel SSH nao subiu na porta local $localDbPort."
  }
}

if (-not (Test-Path $backendEnvResolvedPath)) {
  throw "Arquivo de ambiente do backend nao encontrado em $BackendEnvPath"
}

$envContent = Get-Content $backendEnvResolvedPath
if ($envContent -match "^DATABASE_URL=") {
  $envContent = $envContent -replace "^DATABASE_URL=.*$", "DATABASE_URL=$newDatabaseUrl"
} else {
  $envContent = @("DATABASE_URL=$newDatabaseUrl") + $envContent
}
Set-Content -Path $backendEnvResolvedPath -Value $envContent

# Stop any backend currently listening on port 4000.
$backendListeners = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
if ($backendListeners) {
  $procIds = $backendListeners | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $procIds) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}

# Start backend dev server in a new terminal window.
$startCmd = "Set-Location '$repoRoot'; npm.cmd run dev:backend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $startCmd | Out-Null

Write-Output "Tunel SSH ativo em localhost:$localDbPort"
Write-Output "${BackendEnvPath} atualizado com DATABASE_URL via tunel"
Write-Output "Backend local iniciado em nova janela (porta 4000)"
