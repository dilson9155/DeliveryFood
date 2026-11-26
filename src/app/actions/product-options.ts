"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/permissions";
import { UserType, type AuditAction } from "@prisma/client";

export type OptionResult = { ok: true; id: string } | { ok: false; error: string };

async function requireProductsPermission(): Promise<SessionUser | { ok: false; error: string }> {
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
    return { ok: false, error: "Você não tem permissão para gerenciar opções." };
  }
  return user;
}

function clean(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

async function writeAudit(
  userId: string,
  action: AuditAction,
  resource: string,
  entityId: string,
  details: string
) {
  await audit({ userId, action, resource, entityId, details });
}

export async function saveOptionGroupAction(input: {
  id?: string;
  productId: string;
  name: string;
  description?: string | null;
  minQuantity: number;
  maxQuantity: number;
  required: boolean;
  order: number;
  active: boolean;
}): Promise<OptionResult> {
  const user = await requireProductsPermission();
  if ("ok" in user) return user;

  const name = clean(input.name, 80);
  const productId = clean(input.productId, 40);
  const minQuantity = Number(input.minQuantity);
  const maxQuantity = Number(input.maxQuantity);
  const order = Number(input.order) || 0;

  if (!productId || !name) return { ok: false, error: "Informe o produto e o nome do grupo." };
  if (!Number.isInteger(minQuantity) || minQuantity < 1) {
    return { ok: false, error: "A quantidade mínima deve ser pelo menos 1." };
  }
  if (!Number.isInteger(maxQuantity) || maxQuantity < minQuantity) {
    return { ok: false, error: "A quantidade máxima deve ser maior ou igual à mínima." };
  }
  if (maxQuantity > 99) return { ok: false, error: "A quantidade máxima é 99." };

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return { ok: false, error: "Produto não encontrado." };

  const data = {
    productId,
    name,
    description: clean(input.description, 200) || null,
    minQuantity,
    maxQuantity,
    required: Boolean(input.required),
    order,
    active: Boolean(input.active),
  };

  try {
    const group = input.id
      ? await prisma.productOptionGroup.update({ where: { id: input.id }, data })
      : await prisma.productOptionGroup.create({ data });
    await writeAudit(
      user.id,
      input.id ? "UPDATE" : "CREATE",
      "product-option-group",
      group.id,
      `Grupo "${name}" do produto ${productId} salvo.`
    );
    revalidatePath(`/admin/produtos/${productId}/opcoes`);
    revalidatePath("/admin/produtos");
    revalidatePath("/");
    return { ok: true, id: group.id };
  } catch (error) {
    console.error("Erro ao salvar grupo de opções:", error);
    return { ok: false, error: "Não foi possível salvar o grupo de opções." };
  }
}

export async function deleteOptionGroupAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireProductsPermission();
  if ("ok" in user) return user;

  try {
    const group = await prisma.productOptionGroup.findUnique({
      where: { id },
      select: { id: true, productId: true, name: true },
    });
    if (!group) return { ok: false, error: "Grupo não encontrado." };
    await prisma.productOptionGroup.delete({ where: { id } });
    await writeAudit(user.id, "DELETE", "product-option-group", id, `Grupo "${group.name}" removido.`);
    revalidatePath(`/admin/produtos/${group.productId}/opcoes`);
    revalidatePath("/admin/produtos");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    console.error("Erro ao excluir grupo de opções:", error);
    return { ok: false, error: "Não foi possível excluir o grupo de opções." };
  }
}

export async function saveProductOptionAction(input: {
  id?: string;
  groupId: string;
  name: string;
  price: number;
  order: number;
  active: boolean;
}): Promise<OptionResult> {
  const user = await requireProductsPermission();
  if ("ok" in user) return user;

  const name = clean(input.name, 80);
  const price = Number(input.price);
  if (!input.groupId || !name) return { ok: false, error: "Informe o nome da opção." };
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: "Preço adicional inválido." };

  const group = await prisma.productOptionGroup.findUnique({
    where: { id: input.groupId },
    select: { id: true, productId: true },
  });
  if (!group) return { ok: false, error: "Grupo não encontrado." };

  const data = {
    groupId: input.groupId,
    name,
    price: Math.round(price * 100) / 100,
    order: Number(input.order) || 0,
    active: Boolean(input.active),
  };

  try {
    const option = input.id
      ? await prisma.productOption.update({ where: { id: input.id }, data })
      : await prisma.productOption.create({ data });
    await writeAudit(
      user.id,
      input.id ? "UPDATE" : "CREATE",
      "product-option",
      option.id,
      `Opção "${name}" salva no grupo ${input.groupId}.`
    );
    revalidatePath(`/admin/produtos/${group.productId}/opcoes`);
    revalidatePath("/");
    return { ok: true, id: option.id };
  } catch (error) {
    console.error("Erro ao salvar opção:", error);
    return { ok: false, error: "Não foi possível salvar a opção." };
  }
}

export async function deleteProductOptionAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireProductsPermission();
  if ("ok" in user) return user;

  try {
    const option = await prisma.productOption.findUnique({
      where: { id },
      include: { group: { select: { productId: true } } },
    });
    if (!option) return { ok: false, error: "Opção não encontrada." };
    await prisma.productOption.delete({ where: { id } });
    await writeAudit(user.id, "DELETE", "product-option", id, `Opção "${option.name}" removida.`);
    revalidatePath(`/admin/produtos/${option.group.productId}/opcoes`);
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    console.error("Erro ao excluir opção:", error);
    return { ok: false, error: "Não foi possível excluir a opção." };
  }
}
