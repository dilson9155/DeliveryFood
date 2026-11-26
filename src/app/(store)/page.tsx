import { prisma } from "@/lib/prisma";
import { getStoreContext } from "@/lib/store-status";
import { Browse } from "@/components/store/browse";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [categories, products, optionGroups, context] = await Promise.all([
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
    getStoreContext(),
  ]);

  const optionGroupsByProduct: Record<string, Omit<(typeof optionGroups)[number], "productId">[]> = {};
  for (const group of optionGroups) {
    const { productId, ...view } = group;
    (optionGroupsByProduct[productId] ??= []).push(view);
  }

  return (
    <Browse
      categories={categories}
      products={products}
      optionGroupsByProduct={JSON.parse(JSON.stringify(optionGroupsByProduct))}
      open={context.open}
    />
  );
}