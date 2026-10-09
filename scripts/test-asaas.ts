/**
 * Teste isolado da integração Asaas (PIX sandbox).
 * Executa fora do Next: precisa que .env esteja presente.
 */
import "dotenv/config";
import { createPixPayment } from "../src/lib/asaas.js";

async function main() {
  const cfg = {
    url: process.env.ASAAS_API_KEY ? "ok" : "faltando",
    env: process.env.ASAAS_ENV ?? "sandbox",
  };
  console.log("\n[Asaas] Verificando configuração...");
  console.log("  ASAAS_ENV=", cfg.env);
  console.log("  API key presente:", cfg.url);

  const result = await createPixPayment({
    customer: "",
    customerData: {
      name: "Cliente Teste Pixel",
      cpfCnpj: "11144477735",
      email: "teste.pixel@example.com",
      phone: "31988887777",
    },
    value: 10.5,
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    description: "Teste PIX sandbox (script)",
  });

  if (!result.ok) {
    console.error("\n[Asaas] FALHOU:", result.error, result.status ? `(HTTP ${result.status})` : "");
    process.exit(1);
  }

  const pix = result.data.pixTransaction;
  console.log("\n[Asaas] ✅ PIX criado com sucesso!");
  console.log("  paymentId:", result.data.id);
  console.log("  customer:", result.data.customer);
  console.log("  value:", result.data.value);
  console.log("  dueDate:", result.data.dueDate);
  console.log("  QR enc. image (primeiros 60 chars):", pix?.encodedImage?.slice(0, 60));
  console.log("  QR payload (BR Code copia-cola):", pix?.payload?.slice(0, 60), "...");
  console.log("  expiresAt:", pix?.expiresAt);
  if (!pix?.encodedImage || !pix?.payload) {
    console.error("\n[Asaas] ⚠️  QR Code incompleto!");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("Erro inesperado:", e);
  process.exit(99);
});
