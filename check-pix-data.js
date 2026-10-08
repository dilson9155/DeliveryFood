// Verifica dados exigidos pro PIX (taxId/CPF) nos clientes
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);

(async () => {
  const p = new PrismaClient({ datasourceUrl: m[1].trim() });
  const users = await p.user.findMany({
    where: { userType: "CUSTOMER" },
    select: { id: true, name: true, email: true, phone: true, taxId: true, active: true },
  });
  console.log("=== CLIENTES ===");
  users.forEach((u) => {
    console.log(`- ${u.name}`);
    console.log(`    email=${u.email || "-"} | phone=${u.phone || "-"}`);
    console.log(`    taxId(CPF)=${u.taxId || "AUSENTE  <-- PIX BLOQUEADO"}`);
  });

  const orders = await p.order.findMany({
    select: { id: true, number: true, status: true, paymentStatus: true, total: true, customerId: true },
    orderBy: { number: "desc" },
    take: 10,
  });
  console.log("\n=== ULTIMOS PEDIDOS (" + orders.length + ") ===");
  orders.forEach((o) => console.log(`- #${o.number} status=${o.status} pagamento=${o.paymentStatus} total=R$${o.total} customerId=${o.customerId}`));

  const intents = await p.paymentIntent.count();
  console.log("\nPaymentIntents existentes: " + intents);
  await p.$disconnect();
})();
