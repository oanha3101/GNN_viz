param(
  [switch]$SkipBuild,
  [switch]$SkipLint
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

if (-not $SkipLint) {
  Invoke-Step "Backend lint (syntax check)" {
    Push-Location (Join-Path $root "backend")
    try {
      python -m py_compile main.py
      python -m py_compile database.py
      python -m py_compile services/hybrid_store.py
      Write-Host "Core modules syntax OK"
    }
    finally {
      Pop-Location
    }
  }

  Invoke-Step "Security scan (hardcoded credentials)" {
    $backendPyFiles = Join-Path (Join-Path $root "backend") "*.py"
    $hits = Select-String -Path $backendPyFiles -Pattern 'password.*=.*[''"]' -SimpleMatch:$false
    if ($hits) {
      Write-Host "WARNING: Possible hardcoded credentials found:" -ForegroundColor Yellow
      $hits | ForEach-Object { Write-Host "  $_" }
    } else {
      Write-Host "No hardcoded credentials detected in backend/*.py"
    }
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
