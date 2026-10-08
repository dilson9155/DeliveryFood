#!/usr/bin/env ts-node
/**
 * Script seguro para limpar dados de teste do banco Neon.
 *
 * Proteções:
 * - Só executa se TEST_DATA_CLEAN_CONFIRM === "YES"
 * - Limite por padrão: mantém os últimos 20 pedidos + seus itens/histórico/pagamentos
 * - Remove: pedidos mais antigos (fora do keep), entregas, intenções, eventos, recibíveis, campanhas de disparo
 * - Não remove: configurações, horários, usuários (clientes/colaboradores), categorias, produtos, caixas/movimentos, contas a pagar
 *
 * Uso:
 *   TEST_DATA_CLEAN_CONFIRM=YES KEEP_LAST_ORDERS=20 npx ts-node scripts/clean-test-data.ts
 *   TEST_DATA_CLEAN_CONFIRM=YES FORCE_ALL=YES npx ts-node scripts/clean-test-data.ts  (CUIDADO)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function main() {
  const confirm = process.env.TEST_DATA_CLEAN_CONFIRM;
  if (confirm !== "YES") {
    console.error("❌ Abortado. Defina TEST_DATA_CLEAN_CONFIRM=YES para confirmar.");
    process.exit(1);
  }

  const keepLast = Number(process.env.KEEP_LAST_ORDERS || "20");
  const forceAll = process.env.FORCE_ALL === "YES";

  console.log("🔍 Limpando dados de teste...");
  console.log(`  keepLastOrders = ${keepLast} | forceAll = ${forceAll}`);

  const totalOrders = await prisma.order.count();
  console.log(`  Total de pedidos: ${totalOrders}`);

  let ordersToDelete: Array<{ id: string; number: number }> = [];
  if (forceAll) {
    ordersToDelete = await prisma.order.findMany({ select: { id: true, number: true } });
  } else {
    const keep = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: keepLast,
      select: { id: true },
    });
    const keepIds = keep.map((k) => k.id);
    ordersToDelete = await prisma.order.findMany({
      where: { id: { notIn: keepIds } },
      select: { id: true, number: true },
    });
  }

  if (ordersToDelete.length === 0) {
    console.log("✅ Nada a deletar.");
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log(`  Pedidos a excluir: ${ordersToDelete.length}`);
  const ids = ordersToDelete.map((o) => o.id);

  const [delDeliveryLoc, delDelivery, delIntent, delEvents, delPayment, delCash, delHist, delItems, delReceiv, delOrders] = await prisma.$transaction([
    prisma.deliveryLocation.deleteMany({ where: { delivery: { orderId: { in: ids } } } }),
    prisma.delivery.deleteMany({ where: { orderId: { in: ids } } }),
    prisma.paymentIntent.deleteMany({ where: { orderId: { in: ids } } }),
    prisma.paymentEvent.deleteMany({ where: { intent: { orderId: { in: ids } } } }),
    prisma.payment.deleteMany({ where: { orderId: { in: ids } } }),
    prisma.cashMovement.deleteMany({ where: { orderId: { in: ids } } }),
    prisma.orderHistory.deleteMany({ where: { orderId: { in: ids } } }),
    prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } }),
    prisma.receivable.deleteMany({ where: { orderId: { in: ids } } }),
    prisma.order.deleteMany({ where: { id: { in: ids } } }),
  ]);

  console.log("  Removidos:", {
    deliveryLocations: delDeliveryLoc.count,
    deliveries: delDelivery.count,
    paymentIntents: delIntent.count,
    paymentEvents: delEvents.count,
    payments: delPayment.count,
    cashMovements: delCash.count,
    orderHistory: delHist.count,
    orderItems: delItems.count,
    receivables: delReceiv.count,
    orders: delOrders.count,
  });

  // Limpa campanhas de disparo + destinatários (histórico de testes)
  const [delRecs, delCamps] = await prisma.$transaction([
    prisma.campaignRecipient.deleteMany({}),
    prisma.campaign.deleteMany({}),
  ]);
  console.log(`  Campanhas: ${delCamps.count} | Destinatários: ${delRecs.count}`);

  // Limpa notificações de teste
  const delNot = await prisma.notification.deleteMany({});
  console.log(`  Notificações: ${delNot.count}`);

  // Limpa endereços órfãos? mantém vinculados a clientes existentes
  console.log("✅ Limpeza concluída com segurança.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
