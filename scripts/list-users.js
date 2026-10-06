const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({
    select: { name: true, phone: true, email: true, taxId: true, role: true, userType: true },
  });
  console.log(JSON.stringify(users, null, 2));
  await p.$disconnect();
})();