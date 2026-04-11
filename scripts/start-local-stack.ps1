$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Start-TerminalCommand {
  param(
    [string]$Title,
    [string]$Command
  )

  Start-Process powershell.exe -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-Command',
    "Set-Location '$repoRoot'; `$Host.UI.RawUI.WindowTitle = '$Title'; $Command"
  ) | Out-Null
}

Write-Host 'Subindo stack local Love Odonto...'
Write-Host '1/3 Reiniciando backend (porta 3001)...'
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'restart-backend.ps1')

Write-Host '2/3 Abrindo app principal (porta 5176) em nova janela...'
Start-TerminalCommand -Title 'Love Odonto App' -Command 'npm run dev'

Start-Sleep -Seconds 2

Write-Host '3/3 Abrindo Console (porta 5177) em nova janela...'
Start-TerminalCommand -Title 'Love Odonto Console' -Command 'npm run console:dev'

Write-Host ''
Write-Host 'Stack solicitada com sucesso.'
Write-Host 'App principal: http://localhost:5176'
Write-Host 'Console:       http://localhost:5177/login'
Write-Host 'Backend:       http://localhost:3001'
