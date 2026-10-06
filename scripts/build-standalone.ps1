# Build standalone para deploy em hospedagem compartilhada
# (Hostinger Business, etc.) que NÃO tem Docker.
#
# Gera:
#   - .next/standalone/         (servidor Node.js mínimo, sem node_modules)
#   - .next/static/             (assets estáticos)
#   - public/                   (arquivos públicos)
#   - prisma/                   (para migrations via SSH)
#
# Resultado final: pasta `.next/standalone` que você compacta em ZIP.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..   # raiz do projeto

Write-Host "=== Build standalone para hosting compartilhado ===" -ForegroundColor Cyan
Write-Host ""

# 1) Garantir .env do .env carregado
if (-not (Test-Path ".env")) {
  Write-Host "ERRO: .env não encontrado" -ForegroundColor Red
  exit 1
}

# 2) Setar NODE_PATH (workaround Turbopack)
$env:NODE_PATH = (Resolve-Path "node_modules").Path
Write-Host "NODE_PATH = $env:NODE_PATH"

# 3) Limpar build anterior
if (Test-Path ".next") {
  Remove-Item -Recurse -Force ".next"
}

# 4) Build
Write-Host ""
Write-Host "Buildando..." -ForegroundColor Yellow
npm run build 2>&1 | Select-Object -Last 5

if (-not (Test-Path ".next/standalone/server.js")) {
  Write-Host "ERRO: Build falhou (sem .next/standalone/server.js)" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "✓ Build OK em .next/standalone" -ForegroundColor Green
Write-Host ""
Write-Host "Próximo passo: comprimir com DEPLOY_HOSTINGER_COMPARTILHADO.md"