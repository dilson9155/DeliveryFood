import { prisma } from "@/lib/prisma";
import { getStoreContext } from "@/lib/store-status";
import { businessDate } from "@/lib/daily-menu";
import { Browse } from "@/components/store/browse";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [categories, products, optionGroups, dailyMenu, context] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, icon: true },
    }),
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        imageUrl: true,
        categoryId: true,
        featured: true,
      },
    }),
    prisma.productOptionGroup.findMany({
      where: { active: true, product: { active: true } },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        id: true,
        productId: true,
        name: true,
        description: true,
        minQuantity: true,
        maxQuantity: true,
        required: true,
        order: true,
        options: {
          where: { active: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
          select: { id: true, name: true, price: true, order: true },
        },
      },
    }),
    prisma.dailyMenu.findUnique({
      where: { date: businessDate() },
      include: {
        meals: {
          where: { active: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
          include: { prices: true },
        },
        sizes: {
          where: { active: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
        },
      },
    }),
    getStoreContext(),
  ]);

  const optionGroupsByProduct: Record<string, Omit<(typeof optionGroups)[number], "productId">[]> = {};
  for (const group of optionGroups) {
    const { productId, ...view } = group;
    (optionGroupsByProduct[productId] ??= []).push(view);
  }

  const dailyMeals = dailyMenu?.active
    ? dailyMenu.meals
        .filter((meal) => meal.availableQty === null || meal.availableQty > 0)
        .map((meal) => ({
          mealId: meal.id,
          name: meal.name,
          description: meal.description,
          imageUrl: meal.imageUrl,
          availableQty: meal.availableQty,
          sizes: dailyMenu.sizes.flatMap((size) => {
            const price = meal.prices.find((row) => row.sizeId === size.id);
            return price ? [{ id: size.id, name: size.name, price: price.price }] : [];
          }),
        }))
        .filter((meal) => meal.sizes.length > 0)
    : [];

  return (
    <Browse
      categories={categories}
      products={products}
      optionGroupsByProduct={JSON.parse(JSON.stringify(optionGroupsByProduct))}
      dailyMeals={JSON.parse(JSON.stringify(dailyMeals))}
      open={context.open}
    />
  );
}