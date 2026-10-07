#!/usr/bin/env node
/**
 * build-hostinger-deploy.js
 *
 * Constrói um ZIP pronto pra Hostinger Business Node.js App.
 * Estrutura flat (sem pasta raiz) compatível com hPanel Node.js Apps.
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { execSync } = require('child_process');

const PROJECT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(PROJECT, 'dist');
const STANDALONE = path.join(PROJECT, '.next', 'standalone');
const STATIC = path.join(PROJECT, '.next', 'static');
const PUBLIC = path.join(PROJECT, 'public');
const ENV_EXAMPLE = path.join(PROJECT, '.env.example');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const zipName = `delivery-food-hostinger-${Date.now()}.zip`;
const zipPath = path.join(OUT_DIR, zipName);
const latestPath = path.join(OUT_DIR, 'delivery-food-hostinger.zip');

console.log('=== Build Hostinger Deploy Package ===\n');

// 1) Verifica se standalone existe
if (!fs.existsSync(STANDALONE)) {
  console.error('ERRO: .next/standalone/ não existe.');
  console.error('Rode: NODE_PATH=$(pwd)/node_modules npm run build');
  process.exit(1);
}

console.log('[1/4] Empacotando arquivos...');

const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`   Tamanho: ${archive.pointer()} bytes`);
  console.log(`   Path:    ${zipPath}`);
});

output.on('end', () => {
  // copy to 'latest'
  fs.copyFileSync(zipPath, latestPath);
  console.log(`\nPronto! Use: dist/delivery-food-hostinger.zip`);
});

archive.on('warning', (err) => {
  if (err.code !== 'ENOENT') console.warn('AVISO:', err);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// 2) Conteúdo do standalone (sem a pasta raiz)
archive.glob('**/*', { cwd: STANDALONE, ignore: ['.next/static/**'] });

// 3) Static files (vai pra .next/static/)
archive.glob('**/*', { cwd: STATIC, prefix: '.next/static' });

// 4) Public (imagens públicas)
if (fs.existsSync(PUBLIC)) {
  archive.glob('**/*', { cwd: PUBLIC });
}

// 5) .env.example (pra referência)
if (fs.existsSync(ENV_EXAMPLE)) {
  archive.file(ENV_EXAMPLE, { name: '.env.example' });
}

// 6) Instruções
archive.append(getInstructions(), { name: 'LEIA-ME-PRIMEIRO.txt' });

archive.finalize();

function getInstructions() {
  return `DELICIAS DAS ESTACOES - DEPLOY HOSTINGER BUSINESS
====================================================

CONTEUDO DESTE ZIP (estrutura flat):
  server.js            <- entry point
  package.json         <- "start": "next start"
  node_modules/        <- deps minimas
  .next/               <- codigo compilado
  .next/static/        <- assets estaticos (CSS, JS)
  public/              <- imagens publicas

COMO USAR NA HOSTINGER:

1. Upload deste ZIP para a pasta do subdominio via FileZilla
   (ex: /home/u222240285/domains/deliveryfood.elitesistemas.io/public_html/)

2. No hPanel -> Gerenciador de Arquivos, clique direito no ZIP -> Extrair

3. Crie um arquivo .env na mesma pasta com:
   DATABASE_URL="postgresql://..."
   AUTH_SECRET="$(openssl rand -base64 32)"
   AUTH_TRUST_HOST=true
   NEXTAUTH_URL=https://deliveryfood.elitesistemas.io
   NODE_ENV=production
   ASAAS_ENV=sandbox
   ASAAS_API_KEY=...

4. No hPanel -> Hospedagem -> Node.js -> Criar Aplicacao:
   - Versao Node: 22
   - Modo: Production
   - Startup file: server.js
   - Application root: /home/u222240285/domains/deliveryfood.elitesistemas.io/public_html
   - Application URL: deliveryfood.elitesistemas.io

5. Adicione as variaveis de ambiente no painel Node.js App.

6. Inicie a aplicacao.

Pronto!
`;
}
