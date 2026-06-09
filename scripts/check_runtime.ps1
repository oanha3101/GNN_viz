param(
  [string]$BackendUrl = "http://127.0.0.1:8000/api/health"
)

$ErrorActionPreference = "Stop"

function Test-TcpPort {
  param(
    [string]$Host,
    [int]$Port,
    [string]$Label
  )

  $ok = Test-NetConnection -ComputerName $Host -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
  if ($ok) {
    Write-Host "[OK] $Label ($Host`:$Port)" -ForegroundColor Green
  } else {
    Write-Host "[FAIL] $Label ($Host`:$Port)" -ForegroundColor Red
  }
  return $ok
}

$allOk = $true
$allOk = (Test-TcpPort -Host "127.0.0.1" -Port 3344 -Label "MySQL") -and $allOk
$allOk = (Test-TcpPort -Host "127.0.0.1" -Port 27017 -Label "MongoDB") -and $allOk
$allOk = (Test-TcpPort -Host "127.0.0.1" -Port 6379 -Label "Redis") -and $allOk
$allOk = (Test-TcpPort -Host "127.0.0.1" -Port 9000 -Label "MinIO API") -and $allOk
$allOk = (Test-TcpPort -Host "127.0.0.1" -Port 8080 -Label "phpMyAdmin") -and $allOk

try {
  $health = Invoke-RestMethod -Uri $BackendUrl -Method Get -TimeoutSec 5
  Write-Host "[OK] Backend health endpoint responded" -ForegroundColor Green
  Write-Host ("      status={0}" -f $health.status)
  if ($health.runtime) {
    foreach ($name in @("mysql", "mongo", "redis", "blob")) {
      if ($health.runtime.$name) {
        $available = $health.runtime.$name.available
        $fallback = $health.runtime.$name.fallback_active
        Write-Host ("      {0}: available={1} fallback_active={2}" -f $name, $available, $fallback)
      }
    }
  }
} catch {
  Write-Host "[FAIL] Backend health endpoint not reachable: $($_.Exception.Message)" -ForegroundColor Red
  $allOk = $false
}

if (-not $allOk) {
  exit 1
}

Write-Host "Runtime stack check completed successfully." -ForegroundColor Green
