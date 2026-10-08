import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PricingPanel } from "@/components/admin/pricing-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Precificação" };

export default async function PricingPage() {
  const [products, runs] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ category: { order: "asc" } }, { order: "asc" }, { name: "asc" }],
      include: { category: { select: { name: true } } },
    }),
    prisma.pricingRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        createdBy: { select: { name: true } },
        items: true,
      },
    }),
  ]);

  return (
    <PricingPanel
      products={JSON.parse(JSON.stringify(products))}
      runs={JSON.parse(JSON.stringify(runs))}
    />
  );
}