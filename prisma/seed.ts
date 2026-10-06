import { PrismaClient, UserType, EmployeeRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      storeName: "Delivery Food",
      phone: "(31) 99999-9999",
      whatsapp: "(31) 99999-9999",
      address: "Rua das Flores",
      number: "100",
      neighborhood: "Centro",
      city: "Belo Horizonte",
      state: "MG",
      zipCode: "30000-000",
      prepTimeMinutes: 30,
      isManuallyOpen: null,
    },
  });
  console.log("Settings:", settings.storeName);

  const days = [
    { dayOfWeek: 0, name: "Domingo" },
    { dayOfWeek: 1, name: "Segunda" },
    { dayOfWeek: 2, name: "Terça" },
    { dayOfWeek: 3, name: "Quarta" },
    { dayOfWeek: 4, name: "Quinta" },
    { dayOfWeek: 5, name: "Sexta" },
    { dayOfWeek: 6, name: "Sábado" },
  ];
  for (const d of days) {
    await prisma.businessHours.upsert({
      where: { dayOfWeek: d.dayOfWeek },
      update: {},
      create: {
        dayOfWeek: d.dayOfWeek,
        open: true,
        openTime: "10:00",
        closeTime: "22:00",
      },
    });
  }
  console.log("Business hours ok");

  const categoryDefs = [
    { name: "Lanches", icon: "🍔", order: 1 },
    { name: "Pizzas", icon: "🍕", order: 2 },
    { name: "Porções", icon: "🍟", order: 3 },
    { name: "Bebidas", icon: "🥤", order: 4 },
    { name: "Sobremesas", icon: "🍰", order: 5 },
    { name: "Combos", icon: "🔥", order: 6 },
  ];

  const categories: Record<string, string> = {};
  for (const c of categoryDefs) {
    const existing = await prisma.category.findFirst({ where: { name: c.name } });
    const cat =
      existing ||
      (await prisma.category.create({
        data: { name: c.name, icon: c.icon, order: c.order },
      }));
    categories[c.name] = cat.id;
  }
  console.log("Categories ok");

  const productDefs = [
    { name: "X-Burguer", description: "Pão brioche, hambúrguer artesanal 160g, queijo, alface, tomate e molho especial.", price: 18.9, category: "Lanches", featured: true, order: 1 },
    { name: "X-Salada", description: "Hambúrguer, queijo, presunto, alface, tomate e maionese.", price: 16.5, category: "Lanches", featured: false, order: 2 },
    { name: "X-Tudo", description: "Dois hambúrgueres, bacon, ovo, queijo, presunto, alface, tomate e batata palha.", price: 24.9, category: "Lanches", featured: true, order: 3 },
    { name: "Pizza Calabresa", description: "Molho de tomate, muçarela, calabresa, cebola e orégano.", price: 39.9, category: "Pizzas", featured: false, order: 1 },
    { name: "Pizza Margherita", description: "Molho de tomate, muçarela, tomate fresco e manjericão.", price: 36.9, category: "Pizzas", featured: false, order: 2 },
    { name: "Porção de Batata Frita", description: "Batata frita crocante com sal e molho da casa.", price: 22.9, category: "Porções", featured: false, order: 1 },
    { name: "Porção de Frango a Passarinho", description: "Frango a passarinho frito, crocante e temperado.", price: 34.9, category: "Porções", featured: false, order: 2 },
    { name: "Refrigerante Lata", description: "Coca-Cola, Guaraná ou outras marcas disponíveis.", price: 6.0, category: "Bebidas", featured: false, order: 1 },
    { name: "Coca-Cola 2L", description: "Coca-Cola 2 litros bem gelada.", price: 12.0, category: "Bebidas", featured: false, order: 2 },
    { name: "Suco Natural", description: "Suco natural de laranja, limão ou maracujá.", price: 8.5, category: "Bebidas", featured: false, order: 3 },
    { name: "Água Mineral 500ml", description: "Água mineral com ou sem gás.", price: 3.5, category: "Bebidas", featured: false, order: 4 },
    { name: "Pudim", description: "Pudim de leite condensado com calda de caramelo.", price: 7.9, category: "Sobremesas", featured: false, order: 1 },
    { name: "Brownie", description: "Brownie de chocolate com castanhas.", price: 9.9, category: "Sobremesas", featured: false, order: 2 },
    { name: "Combo Burguer", description: "X-Burguer + batata frita + refrigerante lata.", price: 29.9, category: "Combos", featured: true, order: 1 },
    { name: "Combo Casal", description: "2 Pizzas médias + refrigerante 2L.", price: 79.9, category: "Combos", featured: true, order: 2 },
  ];

  for (const p of productDefs) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    if (!existing) {
      await prisma.product.create({
        data: {
          name: p.name,
          description: p.description,
          price: p.price,
          categoryId: categories[p.category],
          featured: p.featured,
          order: p.order,
        },
      });
    }
  }
  console.log("Products ok");

  const adminPassword = await bcrypt.hash("admin123", 10);
  const adminExists = await prisma.user.findFirst({
    where: { OR: [{ email: "admin@delivery.local" }, { login: "admin" }] },
  });
  if (!adminExists) {
    await prisma.user.create({
      data: {
        userType: UserType.EMPLOYEE,
        name: "Administrador",
        email: "admin@delivery.local",
        login: "admin",
        phone: "(31) 99999-0000",
        password: adminPassword,
        role: EmployeeRole.ADMIN,
      },
    });
    console.log("Admin criado: login=admin | senha=admin123");
  } else {
    console.log("Admin já existe");
  }

  const customerPassword = await bcrypt.hash("cliente123", 10);
  const customerExists = await prisma.user.findFirst({
    where: { OR: [{ phone: "31988888888" }, { email: "cliente@delivery.local" }] },
  });
  if (customerExists) {
    await prisma.user.update({
      where: { id: customerExists.id },
      data: { phone: "31988888888" },
    });
    console.log("Cliente demo atualizado");
  } else {
    await prisma.user.create({
      data: {
        userType: UserType.CUSTOMER,
        name: "Cliente Demo",
        phone: "31988888888",
        email: "cliente@delivery.local",
        password: customerPassword,
      },
    });
    console.log("Cliente demo criado");
  }

  console.log("Seed concluído!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());