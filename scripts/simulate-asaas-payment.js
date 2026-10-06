// Simula webhook Asaas: marca a cobrança como paga no banco
// (simulando o que o webhook faria ao receber PAYMENT_RECEIVED)
// Uso: ASAAS_API_KEY=... node scripts/simulate-asaas-payment.js
require("dotenv").config({ path: ".env.local" });

const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const intent = await p.paymentIntent.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { order: true },
  });

  if (!intent) {
    console.log("Nenhum intent pendente. Rode simulate-pix.js primeiro.");
    process.exit(1);
  }

  console.log(`=== Simulando webhook ASAAS ===`);
  console.log(`Pedido: #${intent.order.number}`);
  console.log(`PaymentIntent: ${intent.id}`);
  console.log(`providerPaymentId: ${intent.providerPaymentId}`);

  // 1. Atualiza PaymentIntent
  await p.paymentIntent.update({
    where: { id: intent.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      rawLastResponse: { ...((intent.lastRaw || {})), simulated: true, simulatedBy: "test" },
    },
  });

  // 2. Registra o evento
  await p.paymentEvent.create({
    data: {
      intentId: intent.id,
      type: "webhook.simulated.PAYMENT_RECEIVED",
      rawPayload: { simulated: true, event: "PAYMENT_RECEIVED" },
    },
  });

  // 3. Atualiza Order
  await p.order.update({
    where: { id: intent.orderId },
    data: { paymentStatus: "CONFIRMED" },
  });

  // 4. Cria/atualiza Payment
  await p.payment.upsert({
    where: { orderId: intent.orderId },
    update: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      method: "PIX",
    },
    create: {
      orderId: intent.orderId,
      method: "PIX",
      status: "CONFIRMED",
      amount: intent.amount,
      confirmedAt: new Date(),
    },
  });

  console.log("\n✓ PaymentIntent → PAID");
  console.log("✓ Order.paymentStatus → CONFIRMED");
  console.log("✓ Payment → CONFIRMED");
  console.log("\nAcesse /pedido/<id> no navegador → vai aparecer 'Pagamento confirmado'");

  await p.$disconnect();
})();