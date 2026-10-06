const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const orders = await p.order.findMany({
    where: { paymentStatus: "PENDING" },
    include: {
      customer: { select: { name: true, phone: true, taxId: true } },
      paymentIntent: true,
    },
    take: 10,
    orderBy: { createdAt: "desc" },
  });
  console.log(JSON.stringify(orders.map((o) => ({
    id: o.id,
    number: o.number,
    total: o.total,
    paymentStatus: o.paymentStatus,
    customer: o.customer.name,
    taxId: o.customer.taxId,
    hasIntent: !!o.paymentIntent,
  })), null, 2));
  await p.$disconnect();
})();