param(
  [int]$BackendPort = 4000,
  [int]$TunnelPort = 55432,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Stop-ListenersByPort {
  param(
    [int]$Port,
    [string]$Label
  )

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) {
    Write-Output "Nenhum processo escutando em $Label (porta $Port)."
    return
  }

  $procIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $procIds) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if (-not $proc) {
      continue
    }

    if ($DryRun) {
      Write-Output "[DryRun] Encerraria $($proc.ProcessName) (PID $procId) em $Label (porta $Port)."
      continue
    }

    try {
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Output "Encerrado $($proc.ProcessName) (PID $procId) em $Label (porta $Port)."
    } catch {
      Write-Warning "Falha ao encerrar PID $procId em ${Label}: $($_.Exception.Message)"
    }
  }
}

Stop-ListenersByPort -Port $BackendPort -Label "backend"
Stop-ListenersByPort -Port $TunnelPort -Label "tunel SSH"

if ($DryRun) {
  Write-Output "DryRun concluido. Nenhum processo foi finalizado."
} else {
  Write-Output "Parada concluida."
}
