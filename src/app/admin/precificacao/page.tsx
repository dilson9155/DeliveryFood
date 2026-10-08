import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PricingPanel } from "@/components/admin/pricing-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Precificação" };

export default async function PricingPage() {
  const [products, runs, costs] = await Promise.all([
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
    prisma.pricingCost.findMany({
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <PricingPanel
      products={JSON.parse(JSON.stringify(products))}
      runs={JSON.parse(JSON.stringify(runs))}
      costs={JSON.parse(JSON.stringify(costs))}
    />
  );
}