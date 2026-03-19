[CmdletBinding()]
param(
  [string]$ServerIp = '178.156.252.137',
  [string]$ServerUser = 'root',
  [string]$ServerPath = '/opt/autozap',
  [string]$CommitMessage = 'chore: sync backend hotfix from production',
  [switch]$SkipDeploy
)

$ErrorActionPreference = 'Stop'

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando obrigatorio nao encontrado: $Name"
  }
}

function Read-PlainPassword {
  $securePassword = Read-Host -AsSecureString "Senha SSH para $ServerUser@$ServerIp"
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

Require-Command git
Require-Command sshpass
Require-Command ssh

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repoRoot

$localStatus = git status --porcelain
if ($LASTEXITCODE -ne 0) {
  throw 'Falha ao verificar status do Git local.'
}

if (-not [string]::IsNullOrWhiteSpace(($localStatus | Out-String).Trim())) {
  throw 'Working tree local nao esta limpo. Faca commit/stash antes de sincronizar.'
}

$password = $env:AUTOSZAP_VPS_PASSWORD
if ([string]::IsNullOrWhiteSpace($password)) {
  $password = Read-PlainPassword
}

if ([string]::IsNullOrWhiteSpace($password)) {
  throw 'Senha SSH nao informada.'
}

$commitMessageBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($CommitMessage))
$remoteCommitScriptTemplate = @'
set -e
cd {0}
if [ -n "$(git status --porcelain -- backend)" ]; then
  commit_message=$(printf '%s' '{1}' | base64 -d)
  git add backend
  printf '%s\n' "$commit_message" | git -c user.name='AutosZap Ops Sync' -c user.email='ops@autoszap.com' commit -F -
  echo '__BACKEND_COMMITTED__'
else
  echo '__NO_BACKEND_CHANGES__'
fi
git rev-parse HEAD
'@
$remoteCommitScript = [string]::Format(
  $remoteCommitScriptTemplate,
  $ServerPath,
  $commitMessageBase64
)

Write-Host '1) Verificando e commitando mudancas no backend da VPS...'
$commitOutput = & sshpass -p $password ssh -o StrictHostKeyChecking=accept-new "$ServerUser@$ServerIp" $remoteCommitScript 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao preparar commit no servidor:`n$($commitOutput | Out-String)"
}

$commitLog = ($commitOutput | Out-String).Trim()
$remoteHead = ($commitOutput | Select-Object -Last 1).ToString().Trim()
if (-not ($remoteHead -match '^[0-9a-f]{40}$')) {
  throw "Nao foi possivel identificar o HEAD remoto apos commit. Saida:`n$commitLog"
}

$hasRemoteBackendCommit = $commitLog -match '__BACKEND_COMMITTED__'
if ($hasRemoteBackendCommit) {
  Write-Host "   Backend commitado na VPS. HEAD: $remoteHead"
}
else {
  Write-Host "   Nenhuma alteracao pendente em backend na VPS. HEAD: $remoteHead"
}

$remoteGitUrl = "ssh://$ServerUser@$ServerIp$ServerPath/.git"
$previousGitSshCommand = $env:GIT_SSH_COMMAND
$env:GIT_SSH_COMMAND = "sshpass -p '$password' ssh -o StrictHostKeyChecking=accept-new"

try {
  Write-Host '2) Buscando codigo da VPS para o repositorio local...'
  git fetch $remoteGitUrl main
  if ($LASTEXITCODE -ne 0) {
    throw 'Falha ao fazer fetch do repositorio remoto da VPS.'
  }

  $localHeadBeforeMerge = (git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw 'Falha ao identificar HEAD local.'
  }

  $fetchedHead = (git rev-parse FETCH_HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw 'Falha ao identificar FETCH_HEAD.'
  }

  Write-Host '3) Sincronizando historico local com a VPS...'
  git merge-base --is-ancestor $localHeadBeforeMerge $fetchedHead
  if ($LASTEXITCODE -eq 0) {
    git merge --ff-only FETCH_HEAD
    if ($LASTEXITCODE -ne 0) {
      throw 'Falha ao aplicar fast-forward local a partir do servidor.'
    }
  }
  else {
    git merge-base --is-ancestor $fetchedHead $localHeadBeforeMerge
    if ($LASTEXITCODE -ne 0) {
      throw 'Historico local e remoto divergiram. Resolva antes de sincronizar.'
    }

    Write-Host '   Local ja contem o estado remoto (nenhum merge necessario).'
  }

  Write-Host '4) Enviando para GitHub (origin/main)...'
  git push origin main
  if ($LASTEXITCODE -ne 0) {
    throw 'Falha ao enviar alteracoes para o GitHub.'
  }
}
finally {
  if ($null -eq $previousGitSshCommand) {
    Remove-Item Env:GIT_SSH_COMMAND -ErrorAction SilentlyContinue
  }
  else {
    $env:GIT_SSH_COMMAND = $previousGitSshCommand
  }
}

if (-not $SkipDeploy) {
  Write-Host '5) Reimplantando backend na VPS para garantir estado limpo e versionado...'
  $deployOutput = & sshpass -p $password ssh -o StrictHostKeyChecking=accept-new "$ServerUser@$ServerIp" "cd $ServerPath && bash scripts/deploy/deploy.sh" 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Falha no deploy apos sincronizacao:`n$($deployOutput | Out-String)"
  }
  Write-Host ($deployOutput | Out-String)
}

Write-Host ''
Write-Host 'Sincronizacao concluida com sucesso.'
Write-Host "Servidor: $ServerUser@${ServerIp}:$ServerPath"
Write-Host "Commit remoto final: $remoteHead"
