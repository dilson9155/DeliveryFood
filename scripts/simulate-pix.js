// Simula fluxo completo de PIX:
// 1. Pega pedido pendente + cria OrderRecord
// 2. Cria cobrança PIX no Asaas
// 3. "Paga" via Asaas (simulação)
// 4. Verifica se webhook/polling detecta
//
// Uso: ASAAS_API_KEY=... node scripts/simulate-pix.js
require("dotenv").config({ path: ".env.local" });

const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const ASAAS_KEY = process.env.ASAAS_API_KEY;
if (!ASAAS_KEY) { console.error("Faltou ASAAS_API_KEY no .env.local"); process.exit(1); }

const ASAAS_BASE = "https://sandbox.asaas.com/api/v3";

async function asaas(path, opts = {}) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method: opts.method || "GET",
    headers: {
      access_token: ASAAS_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Asaas error:", res.status, JSON.stringify(data, null, 2));
    throw new Error(data.errors?.[0]?.description || `HTTP ${res.status}`);
  }
  return data;
}

(async () => {
  // 1. Pega qualquer pedido pendente com cliente que tem CPF
  const order = await p.order.findFirst({
    where: {
      paymentStatus: "PENDING",
      customer: { taxId: { not: null } },
    },
    orderBy: { createdAt: "desc" },
    include: { customer: true, items: true },
  });

  if (!order) {
    console.error("Nenhum pedido pendente do Cliente Demo. Crie um pedido primeiro.");
    process.exit(1);
  }

  console.log(`\n=== Pedido #${order.number} ===`);
  console.log(`Cliente: ${order.customer.name}`);
  console.log(`CPF: ${order.customer.taxId}`);
  console.log(`Total: R$ ${order.total}`);
  console.log(`Status atual: ${order.paymentStatus}\n`);

  // 2. Cria ou encontra cliente no Asaas
  console.log("1. Criando cliente no Asaas...");
  const existingAsaas = await asaas(`/customers?cpfCnpj=${order.customer.taxId}`);
  let customerId;
  if (existingAsaas.data && existingAsaas.data.length > 0) {
    customerId = existingAsaas.data[0].id;
    console.log(`   Já existe: ${customerId}`);
  } else {
    const c = await asaas(`/customers`, {
      method: "POST",
      body: {
        name: order.customer.name,
        cpfCnpj: order.customer.taxId,
        email: order.customer.email || `pedido${order.number}@a.com`,
        phone: order.customer.phone,
      },
    });
    customerId = c.id;
    console.log(`   Criado: ${customerId}`);
  }

  // 3. Cria cobrança PIX
  console.log("\n2. Criando cobrança PIX...");
  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const charge = await asaas(`/payments`, {
    method: "POST",
    body: {
      customer: customerId,
      billingType: "PIX",
      value: order.total,
      dueDate,
      description: `Pedido #${String(order.number).padStart(4, "0")}`,
    },
  });
  console.log(`   Cobrança: ${charge.id} (status: ${charge.status})`);

  // 4. Gera QR Code
  console.log("\n3. Gerando QR Code...");
  const qr = await asaas(`/payments/${charge.id}/pixQrCode`);
  console.log(`   QR gerado, expira em: ${qr.expirationDate}`);
  console.log(`   Payload: ${qr.payload.slice(0, 80)}...`);

  // 5. Salva no banco
  console.log("\n4. Salvando PaymentIntent no banco...");
  await p.paymentIntent.upsert({
    where: { orderId: order.id },
    update: {
      provider: "ASAAS",
      providerPaymentId: charge.id,
      status: "PENDING",
      method: "PIX",
      amount: order.total,
      qrCodeBase64: qr.encodedImage,
      qrCodeText: qr.payload,
      pixExpiresAt: new Date(qr.expirationDate),
      invoiceUrl: charge.invoiceUrl,
      rawLastResponse: charge,
    },
    create: {
      orderId: order.id,
      provider: "ASAAS",
      providerPaymentId: charge.id,
      status: "PENDING",
      method: "PIX",
      amount: order.total,
      qrCodeBase64: qr.encodedImage,
      qrCodeText: qr.payload,
      pixExpiresAt: new Date(qr.expirationDate),
      invoiceUrl: charge.invoiceUrl,
      rawLastResponse: charge,
    },
  });

  await p.paymentEvent.create({
    data: {
      intentId: (await p.paymentIntent.findUnique({ where: { orderId: order.id } })).id,
      type: "pix.simulated.created",
      rawPayload: { chargeId: charge.id, qr: { hasBase64: !!qr.encodedImage } },
    },
  });

  console.log("   Salvo.");

  // 6. Tenta simular pagamento (Asaas não tem endpoint público de simulação,
  // mas em sandbox às vezes funciona via /charges/{id}/authorize)
  console.log("\n5. Tentando simular pagamento via Asaas sandbox...");
  try {
    // Em sandbox, a Asaas permite simular via PATCH em payment status
    // Tenta endpoint alternativo
    const simResult = await asaas(`/payments/${charge.id}`, {
      method: "POST", // workaround
      body: { status: "RECEIVED" },
    });
    console.log(`   Simulação OK: status = ${simResult.status}`);
  } catch (err) {
    console.log(`   Não foi possível simular direto na Asaas: ${err.message}`);
    console.log(`   Você pode pagar via app usando o payload:`);
    console.log(`   ${qr.payload}`);
  }

  console.log("\n=== Resumo ===");
  console.log(`Payment ID Asaas: ${charge.id}`);
  console.log(`Status atual: ${charge.status}`);
  console.log(`\nAcesse /pedido/${order.id} no navegador para ver o QR + polling`);

  await p.$disconnect();
})();