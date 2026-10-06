# Monta o pacote final pra upload em hospedagem compartilhada (Hostinger)
# Gera um ZIP em dist/delicias-deploy.zip com tudo que precisa,
# EXCETO o .env (você seta manualmente no servidor).

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$outDir = "dist"
$zipPath = "dist/delicias-deploy.zip"

# 0) Limpar dist/
if (Test-Path $outDir) {
  Remove-Item -Recurse -Force $outDir
}
New-Item -ItemType Directory -Path $outDir | Out-Null

# 1) Staging area: copia tudo que vai precisar
$stage = "dist/_stage"
New-Item -ItemType Directory -Path $stage | Out-Null

# .next/standalone (o servidor Node)
if (-not (Test-Path ".next/standalone")) {
  Write-Host "ERRO: rode build-standalone.ps1 primeiro" -ForegroundColor Red
  exit 1
}

Write-Host "Copiando .next/standalone..." -ForegroundColor Yellow
Copy-Item -Recurse -Force ".next/standalone" "$stage/delivery"

# Adicionar public/, prisma/ e package.json (alguns hosts precisam)
Write-Host "Copiando public/ e prisma/" -ForegroundColor Yellow
Copy-Item -Recurse -Force "public" "$stage/delivery/public"
Copy-Item -Recurse -Force "prisma" "$stage/delivery/prisma"
Copy-Item -Force "package.json" "$stage/delivery/package.json"

# 2) Criar .env.example dentro do ZIP (você edita no servidor)
Copy-Item -Force ".env.example" "$stage/delivery/.env.example"

# 3) Criar instruções de inicialização
$startSh = "#!/bin/bash
# Como iniciar o app
cd delivery
node server.js"
$startSh | Out-File -FilePath "$stage/delivery/start.sh" -Encoding ASCII

# 4) Remover .env se foi copiado por engano
if (Test-Path "$stage/delivery/.env") {
  Remove-Item -Force "$stage/delivery/.env"
  Write-Host "  ✓ Removido .env do pacote (configure manualmente no servidor)" -ForegroundColor Magenta
}

# 5) Compactar
Write-Host ""
Write-Host "Compactando em $zipPath..." -ForegroundColor Yellow
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path "$stage/*" -DestinationPath $zipPath -CompressionLevel Optimal

$size = (Get-Item $zipPath).Length / 1MB
Write-Host ""
Write-Host "✓ Pacote gerado: $zipPath ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
Write-Host ""
Write-Host "Próximo passo:" -ForegroundColor Cyan
Write-Host "  1. Faça upload do ZIP para public_html/ no painel Hostinger"
Write-Host "  2. Descompacte no servidor"
Write-Host "  3. Copie .env.example para .env e preencha com seus valores reais"
Write-Host "  4. No terminal do servidor: cd public_html/delivery && node server.js"