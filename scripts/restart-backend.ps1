$ErrorActionPreference = 'Stop'

$port = 3001
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Get-ListeningPidsByPort {
  param(
    [int]$TargetPort
  )

  $lines = netstat -ano -p tcp | findstr ":$TargetPort"
  if (-not $lines) {
    return @()
  }

  $pids = @()
  foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if (-not $trimmed) { continue }
    if ($trimmed -notmatch 'LISTENING') { continue }

    $parts = $trimmed -split '\s+'
    if ($parts.Length -lt 5) { continue }
    $pidText = $parts[$parts.Length - 1]
    $parsedPid = 0
    if ([int]::TryParse($pidText, [ref]$parsedPid) -and $parsedPid -gt 0) {
      $pids += $parsedPid
    }
  }

  return $pids | Sort-Object -Unique
}

function Wait-UntilPortFree {
  param(
    [int]$TargetPort,
    [int]$TimeoutMs = 10000
  )

  $start = Get-Date
  while (((Get-Date) - $start).TotalMilliseconds -lt $TimeoutMs) {
    $current = Get-ListeningPidsByPort -TargetPort $TargetPort
    if ($current.Count -eq 0) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Wait-UntilPortListening {
  param(
    [int]$TargetPort,
    [int]$TimeoutMs = 15000
  )

  $start = Get-Date
  while (((Get-Date) - $start).TotalMilliseconds -lt $TimeoutMs) {
    $current = Get-ListeningPidsByPort -TargetPort $TargetPort
    if ($current.Count -gt 0) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

try {
  $activePids = Get-ListeningPidsByPort -TargetPort $port
  if ($activePids.Count -gt 0) {
    Write-Host "Matando processo na porta 3001..."
    foreach ($owningPid in $activePids) {
      try {
        Stop-Process -Id $owningPid -Force -ErrorAction Stop
      } catch {
        Write-Host "Falha ao finalizar PID ${owningPid}: $($_.Exception.Message)"
      }
    }
  } else {
    Write-Host "Nenhum processo escutando na porta 3001."
  }

  Start-Sleep -Milliseconds 1500
  if (-not (Wait-UntilPortFree -TargetPort $port -TimeoutMs 12000)) {
    Write-Host "Erro ao subir backend: a porta 3001 nao foi liberada."
    exit 1
  }

  Write-Host "Iniciando backend..."
  $null = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "server:dev") -WorkingDirectory $repoRoot -NoNewWindow -PassThru

  if (Wait-UntilPortListening -TargetPort $port -TimeoutMs 18000) {
    Write-Host "Backend iniciado com sucesso"
    exit 0
  }

  Write-Host "Erro ao subir backend: a porta 3001 nao abriu no tempo esperado."
  exit 1
} catch {
  Write-Host "Erro ao subir backend: $($_.Exception.Message)"
  exit 1
}
