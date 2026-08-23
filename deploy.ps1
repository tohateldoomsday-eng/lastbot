# ============================================================
# LASTBOT deploy from Windows to VPS over SSH.
# Usage:
#   .\deploy.ps1 -Server root@85.10.200.1 -Path /opt/lastbot
# Prerequisites: git push access and SSH key auth to the VPS.
# ============================================================
param(
  [Parameter(Mandatory = $true)]
  [string]$Server,

  [string]$Path = "/opt/lastbot"
)

Write-Host "==> Pushing code to origin/main..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push failed. Commit your changes first." -ForegroundColor Red
  exit 1
}

Write-Host "==> Running deploy.sh on the VPS ($Server):" -ForegroundColor Cyan
ssh $Server "cd $Path && ./deploy.sh"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Deploy failed. Connect manually: ssh $Server" -ForegroundColor Red
  exit 1
}
Write-Host "==> Deploy finished." -ForegroundColor Green
