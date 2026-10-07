#!/usr/bin/env node
/**
 * build-standalone-zip.js
 *
 * Empacota o .next/standalone + .next/static + public
 * com permissoes UNIX corretas (755/644) para extrair no Hostinger.
 */

const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');

const PROJECT = path.resolve(__dirname, '..');
const STAGING = path.join(require('os').tmpdir(), 'hdeploy-standalone');
const ZIP_OUT = path.join(PROJECT, 'dist', 'delivery-food-hostinger.zip');

console.log('=== Build Standalone ZIP para Hostinger ===\n');

// Verifica build
const STANDALONE = path.join(PROJECT, '.next', 'standalone');
const STATIC = path.join(PROJECT, '.next', 'static');
const PUBLIC = path.join(PROJECT, 'public');

if (!fs.existsSync(path.join(STANDALONE, 'server.js'))) {
  console.error('ERRO: .next/standalone/server.js nao existe.');
  console.error('Execute: npx next build antes.');
  process.exit(1);
}

console.log('[1/4] Copiando standalone para staging...');
if (fs.existsSync(STAGING)) fs.rmSync(STAGING, { recursive: true, force: true });
fs.mkdirSync(STAGING, { recursive: true });

// Standalone (ja vem com .next/, node_modules/, src/, package.json, server.js)
copyDir(STANDALONE, STAGING);
console.log('   standalone/* OK');

// Static files (JS chunks, CSS)
if (fs.existsSync(STATIC)) {
  const staticDst = path.join(STAGING, '.next', 'static');
  fs.mkdirSync(staticDst, { recursive: true });
  copyDir(STATIC, staticDst);
  console.log('   .next/static/ OK');
}

// Public (imagens publicas no root)
if (fs.existsSync(PUBLIC)) {
  copyDir(PUBLIC, STAGING);
  console.log('   public/ OK');
}

// Remove .env se veio com o standalone
const envPath = path.join(STAGING, '.env');
if (fs.existsSync(envPath)) {
  fs.unlinkSync(envPath);
  console.log('   .env removido (env vars vao no painel Hostinger)');
}

// Garante .env.example (template)
const envExampleSrc = path.join(PROJECT, '.env.example');
if (fs.existsSync(envExampleSrc)) {
  fs.copyFileSync(envExampleSrc, path.join(STAGING, '.env.example'));
}

console.log('[2/4] Criando ZIP com archiver (modo 755 diretorios / 644 arquivos)...');
const output = fs.createWriteStream(ZIP_OUT);
const archive = new ZipArchive({
  zlib: { level: 9 },
});

output.on('close', () => {
  const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`   ZIP criado: ${sizeMB} MB`);
  console.log(`   Path: ${ZIP_OUT}`);
});

archive.on('warning', err => {
  if (err.code !== 'ENOENT') console.warn('AVISO:', err);
});

archive.pipe(output);

// Adiciona tudo do staging com permissao 755 em dirs, 644 em files
archive.directory(STAGING, false, entry => ({
  ...entry,
  mode: entry.type === 'directory' ? 0o755 : 0o644,
}));

archive.finalize().then(() => {
  console.log('[3/4] Limpando staging...');
  fs.rmSync(STAGING, { recursive: true, force: true });
  console.log('[4/4] Pronto!');
});

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}
