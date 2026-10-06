import { prisma } from "@/lib/prisma";
import { getStoreContext } from "@/lib/store-status";
import { Browse } from "@/components/store/browse";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [categories, products, context] = await Promise.all([
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
      },
    }),
    getStoreContext(),
  ]);

  return (
    <Browse
      categories={categories}
      products={products}
      open={context.open}
    />
  );
}