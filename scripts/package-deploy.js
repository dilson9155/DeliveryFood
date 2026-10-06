// Monta o pacote final pra upload em hospedagem compartilhada
// Usa só Node (compatível com Windows/Mac/Linux).
//
// Uso: node scripts/package-deploy.js
//
// Saída:
//   dist/delicias-deploy.zip  (pronto pra upload)

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const STAGE = path.join(DIST, "_stage");
const ZIP = path.join(DIST, "delicias-deploy.zip");

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(src)) {
      copyRecursive(path.join(src, f), path.join(dest, f));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log("\n=== Empacotando deploy ===\n");

// 0) Verificar build
if (!fs.existsSync(path.join(ROOT, ".next/standalone/server.js"))) {
  console.error("ERRO: rode 'node scripts/build-standalone.js' primeiro.");
  process.exit(1);
}

// 1) Limpar dist e staging
rmrf(DIST);
fs.mkdirSync(STAGE, { recursive: true });

// 2) Copiar standalone
const destDir = path.join(STAGE, "delivery");
console.log("Copiando .next/standalone ...");
copyRecursive(path.join(ROOT, ".next/standalone"), destDir);

// 3) Adicionar public, prisma e package.json (alguns hosts precisam)
console.log("Copiando public/ ...");
copyRecursive(path.join(ROOT, "public"), path.join(destDir, "public"));
console.log("Copiando prisma/ ...");
copyRecursive(path.join(ROOT, "prisma"), path.join(destDir, "prisma"));
fs.copyFileSync(path.join(ROOT, "package.json"), path.join(destDir, "package.json"));

// 4) Adicionar .env.example
fs.copyFileSync(path.join(ROOT, ".env.example"), path.join(destDir, ".env.example"));

// 5) Remover .env se foi copiado (safety)
const envInStandalone = path.join(destDir, ".env");
if (fs.existsSync(envInStandalone)) {
  fs.unlinkSync(envInStandalone);
  console.log("  Removido .env do pacote (configure manualmente no servidor)");
}

// 6) Script de start
const startScript = `#!/bin/bash
# Como iniciar o app
cd delivery
node server.js
`;
fs.writeFileSync(path.join(STAGE, "delivery/start.sh"), startScript, "utf8");

// 7) Compactar via PowerShell Compress-Archive (Windows nativo)
rmrf(ZIP);
console.log("\nCompactando...");
try {
  // Tenta PowerShell
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${STAGE}/*' -DestinationPath '${ZIP}' -CompressionLevel Optimal"`,
      { stdio: "inherit" }
    );
  } else {
    // Linux/Mac: usa zip do sistema
    execSync(`zip -r "${ZIP}" .`, { cwd: STAGE, stdio: "inherit" });
  }
} catch (err) {
  console.error("\nFalha ao compactar. ZIP não foi gerado.");
  console.error("Erro:", err.message);
  process.exit(1);
}

const size = (fs.statSync(ZIP).size / 1024 / 1024).toFixed(2);
console.log(`\nPacote gerado: ${ZIP} (${size} MB)\n`);
console.log("Próximos passos:");
console.log("  1. Upload do ZIP via FileZilla (SFTP) para public_html/");
console.log("  2. Descompactar no servidor (via cPanel File Manager)");
console.log("  3. Copiar .env.example para .env e preencher");
console.log("  4. No terminal do servidor: cd public_html/delivery && node server.js");
console.log("  5. Configurar proxy reverso (Apache/Nginx) ou usar a porta 3000");