/**
 * Teste isolado da integração Evolution API (WhatsApp).
 * Envia UMA mensagem de teste para o próprio número admin.
 *
 * Variáveis necessárias no .env: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE.
 */
import "dotenv/config";
import { sendWhatsApp, normalizePhone } from "../src/lib/whatsapp";

async function main() {
  console.log("\n[Evolution] Verificando configuração...");
  const cfg = {
    url: process.env.EVOLUTION_API_URL ?? "(vazio)",
    key: process.env.EVOLUTION_API_KEY ? "ok" : "(vazio)",
    instance: process.env.EVOLUTION_INSTANCE ?? "(vazio)",
  };
  console.log("  EVOLUTION_API_URL:", cfg.url);
  console.log("  EVOLUTION_API_KEY:", cfg.key);
  console.log("  EVOLUTION_INSTANCE:", cfg.instance);

  // Para teste, usamos o admin seed (login=admin) — descobre o telefone pelo banco.
  const { prisma } = await import("../src/lib/prisma");
  const admin = await prisma.user.findFirst({
    where: { login: "admin" },
    select: { name: true, phone: true },
  });
  if (!admin || !admin.phone) {
    console.error("\n[Evolution] ⚠️  Sem admin/phone no banco para destino de teste.");
    process.exit(1);
  }
  console.log(`\n[Evolution] Administrador encontrado: ${admin.name} (${admin.phone})`);

  const norm = normalizePhone(admin.phone);
  console.log("[Evolution] Telefone normalizado:", norm);

  const text = `🧪 Teste de envio em massa do DeliveryFood\nHora: ${new Date().toLocaleString("pt-BR")}\nSe você recebeu, a Evolution API está OK ✅`;

  console.log("\n[Evolution] Enviando mensagem única de teste...");
  const result = await sendWhatsApp({ phone: admin.phone, text });
  if (!result.ok) {
    console.error("\n[Evolution] ❌ FALHOU:", result.error);
    process.exit(2);
  }
  console.log("\n[Evolution] ✅ Mensagem enviada com sucesso!");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Erro inesperado:", e);
  try {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  } catch {}
  process.exit(99);
});
