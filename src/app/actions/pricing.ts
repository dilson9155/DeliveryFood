"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/permissions";
import { roundMoney } from "@/lib/format";
import { UserType } from "@prisma/client";
import { z } from "zod";

export type PricingResult =
  | { ok: true; runId: string; appliedItems: number }
  | { ok: false; error: string };

const priceItemSchema = z.object({
  productId: z.string().min(1),
  price: z.number().min(0.01).max(1000000, "Preço fora do limite permitido."),
});

const applySchema = z.object({
  label: z.string().min(2, "Dê um nome para a tabela de preços").max(80),
  note: z.string().max(300).optional().nullable(),
  prices: z
    .array(priceItemSchema)
    .min(1, "Nenhum produto com preço definido para subir.")
    .max(300, "Muitos produtos na mesma rodada."),
});

type AuthFailure = { ok: false; error: string };

async function requirePricingEmployee(): Promise<SessionUser | AuthFailure> {
  const session = await auth();
  const s = session as unknown as {
    user?: {
      id: string;
      userType: UserType;
      role: SessionUser["role"];
      name?: string | null;
      email?: string | null;
    };
  };
  if (!s?.user || s.user.userType !== UserType.EMPLOYEE || !s.user.role) {
    return { ok: false, error: "Acesso restrito a colaboradores." };
  }
  const user: SessionUser = {
    id: s.user.id,
    userType: UserType.EMPLOYEE,
    role: s.user.role,
    name: s.user.name,
    email: s.user.email,
  };
  if (!can(user, "products.manage")) {
    return { ok: false, error: "Você não tem permissão para realizar essa ação." };
  }
  return user;
}

function isUserResult(v: SessionUser | AuthFailure): v is SessionUser {
  return !("ok" in v);
}

/**
 * "Sobe" os novos preços para o estoque/catálogo de produtos:
 * atualiza Product.price e registra a rodada no histórico (antes/depois)
 * para poder ser reutilizada depois.
 */
export async function applyPricingAction(data: {
  label: string;
  note?: string | null;
  prices: { productId: string; price: number }[];
}): Promise<PricingResult> {
  const user = await requirePricingEmployee();
  if (!isUserResult(user)) return user;

  const parsed = applySchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Último preço vence quando o mesmo produto aparece mais de uma vez
  const byId = new Map<string, number>();
  for (const item of parsed.data.prices) {
    byId.set(item.productId, roundMoney(item.price));
  }
  const ids = [...byId.keys()];

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, price: true },
  });
  if (products.length !== byId.size) {
    return { ok: false, error: "Algum dos produtos não existe mais. Recarregue a página." };
  }
  const productById = new Map(products.map((p) => [p.id, p]));

  // Só sobe o que efetivamente mudou
  const changes = ids
    .map((id) => {
      const product = productById.get(id)!;
      const newPrice = byId.get(id)!;
      return {
        productId: id,
        productName: product.name,
        oldPrice: product.price,
        newPrice,
      };
    })
    .filter((c) => roundMoney(c.newPrice) !== roundMoney(c.oldPrice));

  if (changes.length === 0) {
    return { ok: false, error: "Nenhum preço foi alterado em relação ao catálogo atual." };
  }

  const run = await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      await tx.product.update({
        where: { id: c.productId },
        data: { price: c.newPrice },
      });
    }
    return tx.pricingRun.create({
      data: {
        label: parsed.data.label.trim(),
        note: parsed.data.note?.trim() || null,
        createdById: user.id,
        totalItems: changes.length,
        items: {
          create: changes.map((c) => ({
            productId: c.productId,
            productName: c.productName,
            oldPrice: c.oldPrice,
            newPrice: c.newPrice,
          })),
        },
      },
    });
  });

  const sumOld = changes.reduce((acc, c) => acc + c.oldPrice, 0);
  const sumNew = changes.reduce((acc, c) => acc + c.newPrice, 0);
  await audit({
    userId: user.id,
    action: "SETTINGS_CHANGE",
    resource: "pricing",
    entityId: run.id,
    details: `Precificação "${run.label}" aplicada a ${changes.length} produto(s) (soma ${sumNew.toFixed(2)} vs ${sumOld.toFixed(2)} antes).`,
  });

  revalidatePath("/admin/precificacao");
  revalidatePath("/admin/produtos");
  revalidatePath("/");
  return { ok: true, runId: run.id, appliedItems: changes.length };
}

/**
 * Salva a ficha de custos/parâmetros de precificação de um produto (auto-save
 * ao sair do campo). Os valores derivados são sempre recalculados no cliente.
 */
const nullableNum = (min: number, max: number) =>
  z.number().min(min).max(max).nullable().optional();

const costSchema = z.object({
  productId: z.string().min(1),
  code: z.string().max(40).nullable().optional(),
  unit: z.string().min(1).max(10),
  supplier: z.string().max(120).nullable().optional(),
  purchaseCost: nullableNum(0, 1000000),
  freight: nullableNum(0, 1000000),
  otherCosts: nullableNum(0, 1000000),
  additionalCostPct: nullableNum(0, 1000),
  desiredMarginPct: nullableNum(0, 1000),
  taxPct: nullableNum(0, 100),
  commissionPct: nullableNum(0, 100),
  cardFeePct: nullableNum(0, 100),
  marketplaceFeePct: nullableNum(0, 100),
  maxDiscountPct: nullableNum(0, 100),
  fixedCost: nullableNum(0, 1000000),
  notes: z.string().max(500).nullable().optional(),
});

export type PricingCostResult =
  | { ok: true; updatedAt: string }
  | { ok: false; error: string };

export async function savePricingCostAction(data: {
  productId: string;
  code?: string | null;
  unit: string;
  supplier?: string | null;
  purchaseCost?: number | null;
  freight?: number | null;
  otherCosts?: number | null;
  additionalCostPct?: number | null;
  desiredMarginPct?: number | null;
  taxPct?: number | null;
  commissionPct?: number | null;
  cardFeePct?: number | null;
  marketplaceFeePct?: number | null;
  maxDiscountPct?: number | null;
  fixedCost?: number | null;
  notes?: string | null;
}): Promise<PricingCostResult> {
  const user = await requirePricingEmployee();
  if (!isUserResult(user)) return user;

  const parsed = costSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const d = parsed.data;
  const product = await prisma.product.findUnique({
    where: { id: d.productId },
    select: { id: true },
  });
  if (!product) {
    return { ok: false, error: "Produto não encontrado." };
  }

  const fields = {
    code: d.code?.trim() || null,
    unit: (d.unit || "UN").toUpperCase(),
    supplier: d.supplier?.trim() || null,
    purchaseCost: d.purchaseCost ?? null,
    freight: d.freight ?? null,
    otherCosts: d.otherCosts ?? null,
    additionalCostPct: d.additionalCostPct ?? null,
    desiredMarginPct: d.desiredMarginPct ?? null,
    taxPct: d.taxPct ?? null,
    commissionPct: d.commissionPct ?? null,
    cardFeePct: d.cardFeePct ?? null,
    marketplaceFeePct: d.marketplaceFeePct ?? null,
    maxDiscountPct: d.maxDiscountPct ?? null,
    fixedCost: d.fixedCost ?? null,
    notes: d.notes?.trim() || null,
  };

  const saved = await prisma.pricingCost.upsert({
    where: { productId: d.productId },
    create: { productId: d.productId, ...fields },
    update: fields,
    select: { updatedAt: true },
  });

  return { ok: true, updatedAt: saved.updatedAt.toISOString() };
}

/**
 * Reutiliza uma rodada antiga: aplica novamente os preços dela no catálogo
 * e grava uma nova rodada no histórico (para manter o rastro).
 */
export async function reapplyPricingAction(runId: string): Promise<PricingResult> {
  const user = await requirePricingEmployee();
  if (!isUserResult(user)) return user;

  if (!runId || typeof runId !== "string") {
    return { ok: false, error: "Rodada inválida." };
  }

  const run = await prisma.pricingRun.findUnique({
    where: { id: runId },
    include: { items: true },
  });
  if (!run) {
    return { ok: false, error: "Rodada não encontrada." };
  }

  const itemIds = run.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, price: true },
  });
  const currentById = new Map(products.map((p) => [p.id, p.price]));

  const changes = run.items
    .map((item) => {
      const current = currentById.get(item.productId);
      if (current === undefined) return null; // produto removido
      return {
        productId: item.productId,
        productName: item.productName,
        oldPrice: current,
        newPrice: item.newPrice,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .filter((c) => roundMoney(c.newPrice) !== roundMoney(c.oldPrice));

  if (changes.length === 0) {
    return { ok: false, error: "Os preços desta tabela já estão aplicados no catálogo." };
  }

  const newRun = await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      await tx.product.update({
        where: { id: c.productId },
        data: { price: c.newPrice },
      });
    }
    return tx.pricingRun.create({
      data: {
        label: `${run.label} (reaplicada)`,
        note: `Reaplicação da rodada "${run.label}".`,
        createdById: user.id,
        totalItems: changes.length,
        items: {
          create: changes.map((c) => ({
            productId: c.productId,
            productName: c.productName,
            oldPrice: c.oldPrice,
            newPrice: c.newPrice,
          })),
        },
      },
    });
  });

  await audit({
    userId: user.id,
    action: "SETTINGS_CHANGE",
    resource: "pricing",
    entityId: newRun.id,
    details: `Reaplicação da rodada "${run.label}" em ${changes.length} produto(s).`,
  });

  revalidatePath("/admin/precificacao");
  revalidatePath("/admin/produtos");
  revalidatePath("/");
  return { ok: true, runId: newRun.id, appliedItems: changes.length };
}