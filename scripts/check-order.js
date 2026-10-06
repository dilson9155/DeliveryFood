const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const order = await p.order.findUnique({
    where: { id: "327fe1cd-b304-4714-bde8-c59c07dbddd3" },
    include: {
      payment: true,
      paymentIntent: { include: { events: true } },
      customer: { select: { name: true, taxId: true } },
    },
  });
  console.log(JSON.stringify({
    order: {
      number: order.number,
      total: order.total,
      paymentStatus: order.paymentStatus,
      customer: order.customer.name,
    },
    payment: order.payment,
    intent: {
      status: order.paymentIntent?.status,
      method: order.paymentIntent?.method,
      paidAt: order.paymentIntent?.paidAt,
      hasQr: !!order.paymentIntent?.qrCodeBase64,
      hasPayload: !!order.paymentIntent?.qrCodeText,
    },
    events: order.paymentIntent?.events.map((e) => ({
      type: e.type,
      at: e.createdAt,
    })),
  }, null, 2));
  await p.$disconnect();
})();