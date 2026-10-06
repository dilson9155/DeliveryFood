// Script para adicionar CPF a um usuário (ex: cliente demo)
// Uso: DATABASE_URL=postgresql://... node scripts/set-cpf.js
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const phone = process.argv[2] || "31988888888";
  const taxId = process.argv[3] || "24971563792";
  const existing = await p.user.findFirst({ where: { phone } });
  if (!existing) {
    console.error(`Usuário com telefone ${phone} não encontrado.`);
    process.exit(1);
  }
  const u = await p.user.update({ where: { id: existing.id }, data: { taxId } });
  console.log(`OK: ${u.name} (${u.phone}) -> CPF ${u.taxId}`);
  await p.$disconnect();
})();