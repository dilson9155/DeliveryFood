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

async function requirePricingEmployee(): Promise<SessionUser | PricingResult> {
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

function isUserResult(v: SessionUser | PricingResult): v is SessionUser {
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