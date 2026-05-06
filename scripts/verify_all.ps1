param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Invoke-Step {
  param(
    [string]$Label,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Action
}

Invoke-Step "Backend tests" {
  Push-Location (Join-Path $root "backend")
  try {
    pytest tests -q
  }
  finally {
    Pop-Location
  }
}

Invoke-Step "Frontend tests" {
  Push-Location (Join-Path $root "frontend")
  try {
    npm test
  }
  finally {
    Pop-Location
  }
}

if (-not $SkipBuild) {
  Invoke-Step "Frontend production build" {
    Push-Location (Join-Path $root "frontend")
    try {
      npm run build
    }
    finally {
      Pop-Location
    }
  }
}

Write-Host ""
Write-Host "All verification steps completed successfully." -ForegroundColor Green
