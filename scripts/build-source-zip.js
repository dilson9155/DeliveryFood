#!/usr/bin/env node
/**
 * build-source-zip.js
 *
 * Gera ZIP do source code com permissoes UNIX corretas (755).
 * Resolve o problema de EACCES quando o Hostinger extrai ZIPs
 * criados com PowerShell Compress-Archive (que envia perm 0).
 */

const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');

const PROJECT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(PROJECT, 'dist');
const ZIP_OUT = path.join(OUT_DIR, 'delivery-food-source.zip');

// Diretorio temporario para staging
const STAGING = path.join(require('os').tmpdir(), 'hdeploy-src-fixed');

console.log('=== Build Source ZIP (com permissoes UNIX) ===\n');

// Limpa staging
if (fs.existsSync(STAGING)) {
  fs.rmSync(STAGING, { recursive: true, force: true });
}
fs.mkdirSync(STAGING, { recursive: true });

// Diretorios a incluir
const INCLUDE = ['src', 'public', 'prisma'];

// Arquivos individuais
const FILES = [
  'package.json',
  'package-lock.json',
  'next.config.ts',
  'tsconfig.json',
  'next-env.d.ts',
  'postcss.config.mjs',
  'eslint.config.mjs',
  '.env.example',
  'README.md',
];

console.log('[1/4] Copiando source para staging...');
INCLUDE.forEach(dir => {
  const src = path.join(PROJECT, dir);
  const dst = path.join(STAGING, dir);
  if (fs.existsSync(src)) {
    copyDirRecursive(src, dst);
    console.log(`   ${dir}/`);
  }
});

console.log('[2/4] Copiando arquivos de config...');
FILES.forEach(file => {
  const src = path.join(PROJECT, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(STAGING, file));
    console.log(`   ${file}`);
  }
});

console.log('[3/4] Criando ZIP com archiver (modo 755)...');
const output = fs.createWriteStream(ZIP_OUT);
const archive = new ZipArchive({
  zlib: { level: 9 },
  // force perm 755 em diretorios e 644 em arquivos
});

output.on('close', () => {
  console.log(`   ZIP criado: ${(archive.pointer() / 1024).toFixed(1)} KB`);
});

archive.on('warning', err => {
  if (err.code !== 'ENOENT') console.warn('   AVISO:', err);
});

// IMPORTANTE: garantir que TODOS os arquivos/dirs tenham permission 0o755
// (mesmo vazios) para evitar problemas de EACCES no Linux
archive.on('entry', entry => {
  // Force mode to 0o755 (rwxr-xr-x) for everything
});

archive.pipe(output);

// Adiciona tudo do staging
archive.directory(STAGING, false, (entry) => {
  // entry.dev = mode (UNIX permissions)
  // Forçamos 755 pra diretórios, 644 pra arquivos
  const isDir = entry.type === 'directory';
  const mode = isDir ? 0o755 : 0o644;
  return {
    ...entry,
    mode: mode,
  };
});

archive.finalize().then(() => {
  console.log('[4/4] Limpando staging...');
  fs.rmSync(STAGING, { recursive: true, force: true });
  console.log(`\nPronto! Use: dist/delivery-food-source.zip`);
});

function copyDirRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}
