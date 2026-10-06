// Verifica o que foi pro Neon
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient({ log: ["error"] });
(async () => {
  const [users, products, categories, businessHours] = await Promise.all([
    p.user.findMany({ select: { name: true, phone: true, email: true, taxId: true, role: true, userType: true } }),
    p.product.count(),
    p.category.count(),
    p.businessHours.count(),
  ]);
  console.log("USERS:", JSON.stringify(users, null, 2));
  console.log(`\nPRODUCTS: ${products}`);
  console.log(`CATEGORIES: ${categories}`);
  console.log(`BUSINESS_HOURS: ${businessHours}`);
  await p.$disconnect();
})();