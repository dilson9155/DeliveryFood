import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { CategoriesPanel } from "@/components/admin/categories-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });

  return <CategoriesPanel categories={JSON.parse(JSON.stringify(categories))} />;
}