const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
(async () => {
  const p = new PrismaClient({ datasourceUrl: m[1].trim() });
  const mobs = await p.user.findMany({
    where: { role: "MOTOBOY" },
    select: { id: true, name: true, login: true, active: true, userType: true, createdAt: true },
  });
  console.log("=== USUARIOS role=MOTOBOY (" + mobs.length + ") ===");
  mobs.forEach((u) => console.log(`- ${u.name} | login=${u.login} | ativo=${u.active} | ${u.userType} | criado=${u.createdAt.toISOString()}`));
  const all = await p.user.count();
  console.log("Total usuarios: " + all);
  await p.$disconnect();
})();
