import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProductOptionsPanel } from "@/components/admin/product-options-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Opções do produto" };

export default async function ProductOptionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, groups] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, price: true },
    }),
    prisma.productOptionGroup.findMany({
      where: { productId: id },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        options: { orderBy: [{ order: "asc" }, { name: "asc" }] },
      },
    }),
  ]);
  if (!product) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/produtos"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar aos produtos
        </Link>
        <h1 className="text-xl font-bold sm:text-2xl">Opções de {product.name}</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre grupos (carne, feijão, salada, arroz...) e defina quantas opções o cliente pode escolher em cada grupo.
        </p>
      </div>
      <ProductOptionsPanel
        product={product}
        groups={JSON.parse(JSON.stringify(groups))}
      />
    </div>
  );
}
