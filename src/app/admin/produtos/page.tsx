import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ProductsPanel } from "@/components/admin/products-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Produtos" };

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: { category: { select: { name: true } } },
    }),
    prisma.category.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
  ]);

  return (
    <ProductsPanel
      products={JSON.parse(JSON.stringify(products))}
      categories={JSON.parse(JSON.stringify(categories))}
    />
  );
}