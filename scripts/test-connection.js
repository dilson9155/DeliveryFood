// Testa conexão com Neon
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient({ log: ["error"] });
(async () => {
  try {
    await p.$queryRaw`SELECT 1 as ok`;
    console.log("OK: conexão estabelecida com Neon");
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exit(1);
  }
  await p.$disconnect();
})();