// Script: adicionar CPF a TODOS os clientes que não tem
// Uso: DATABASE_URL=... node scripts/set-cpf-by-phone.js
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const updates = [
    { phone: "38999217446", taxId: "52998224725", name: "Vanessa Pereira do Santos" }, // trocado: 39053312005 inválido no Asaas
    { phone: "31983491080", taxId: "10891618678", name: "vanessa pereira" },
  ];
  for (const u of updates) {
    const user = await p.user.findFirst({ where: { phone: u.phone } });
    if (!user) {
      console.log(`✗ ${u.phone} não encontrado`);
      continue;
    }
    await p.user.update({
      where: { id: user.id },
      data: { taxId: u.taxId },
    });
    console.log(`✓ ${u.name} (${u.phone}) → CPF ${u.taxId}`);
  }
  await p.$disconnect();
})();