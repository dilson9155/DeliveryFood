"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type Permission, type SessionUser } from "@/lib/permissions";
import { businessDate } from "@/lib/daily-menu";
import { formatCurrency, roundMoney } from "@/lib/format";
import { getStoreContext } from "@/lib/store-status";
import {
  dailyMenuMealSchema,
  dailyMenuOrderSchema,
  dailyMenuPricesSchema,
  dailyMenuSchema,
  dailyMenuSizeSchema,
  duplicateDailyMenuSchema,
} from "@/lib/validations";
import {
  DeliveryMode,
  DeliveryStatus,
  OrderStatus,
  PaymentStatus,
  UserType,
} from "@prisma/client";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
type AdminResult<T = undefined> = { ok: true; id?: string; data?: T } | { ok: false; error: string };

function employeeOrError(session: unknown): SessionUser | null {
  const s = session as {
    user?: {
      id: string;
      userType: UserType;
      role: SessionUser["role"];
      name?: string | null;
      email?: string | null;
    };
  };
  if (!s?.user || s.user.userType !== UserType.EMPLOYEE || !s.user.role) return null;
  return {
    id: s.user.id,
    userType: UserType.EMPLOYEE,
    role: s.user.role,
    name: s.user.name,
    email: s.user.email,
  };
}

async function requireAdmin(permission: Permission = "products.manage") {
  const user = employeeOrError(await auth());
  if (!user || !can(user, permission)) return null;
  return user;
}

function revalidateMenus() {
  revalidatePath("/admin/cardapio-do-dia");
  revalidatePath("/marmitas-do-dia");
  revalidatePath("/");
}

function parseImageUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^(data:image\/|https?:\/\/|\/)/i.test(trimmed)) {
    throw new Error("A foto deve ser uma URL ou imagem enviada pelo formulário.");
  }
  return trimmed;
}

export async function saveDailyMenuAction(input: {
  id?: string;
  date: string;
  title?: string | null;
  active?: boolean;
}): Promise<AdminResult<string>> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Você não tem permissão para montar cardápios." };

  const parsed = dailyMenuSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { date, title, active } = parsed.data;

  try {
    const existing = await prisma.dailyMenu.findUnique({ where: { date } });
    if (input.id && existing && existing.id !== input.id) {
      return { ok: false, error: "Já existe um cardápio para esta data." };
    }

    const menu = await prisma.dailyMenu.upsert({
      where: { date },
      create: { date, title: title?.trim() || null, active },
      update: { title: title?.trim() || null, active },
    });

    await audit({
      userId: user.id,
      action: existing ? "UPDATE" : "CREATE",
      resource: "daily-menu",
      entityId: menu.id,
      details: `Cardápio ${date} ${active ? "ativado" : "desativado"}.`,
    });
    revalidateMenus();
    return { ok: true, id: menu.id };
  } catch {
    return { ok: false, error: "Não foi possível salvar o cardápio." };
  }
}

export async function setDailyMenuActiveAction(
  id: string,
  active: boolean
): Promise<Result> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Sem permissão." };
  try {
    await prisma.dailyMenu.update({ where: { id }, data: { active } });
    await audit({
      userId: user.id,
      action: "UPDATE",
      resource: "daily-menu",
      entityId: id,
      details: active ? "Cardápio ativado." : "Cardápio encerrado.",
    });
    revalidateMenus();
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível alterar o cardápio." };
  }
}

export async function duplicateDailyMenuAction(input: {
  sourceId: string;
  date: string;
}): Promise<AdminResult<string>> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Você não tem permissão para montar cardápios." };

  const parsed = duplicateDailyMenuSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { sourceId, date } = parsed.data;

  const [source, existing] = await Promise.all([
    prisma.dailyMenu.findUnique({
      where: { id: sourceId },
      include: {
        meals: {
          orderBy: [{ order: "asc" }, { name: "asc" }],
          include: { prices: true },
        },
        sizes: { orderBy: [{ order: "asc" }, { name: "asc" }] },
      },
    }),
    prisma.dailyMenu.findUnique({ where: { date }, select: { id: true } }),
  ]);
  if (!source) return { ok: false, error: "Cardápio de origem não encontrado." };
  if (existing) return { ok: false, error: "Já existe um cardápio para a data escolhida." };

  const mealIds = new Map<string, string>();
  const sizeIds = new Map<string, string>();
  for (const meal of source.meals) mealIds.set(meal.id, randomUUID());
  for (const size of source.sizes) sizeIds.set(size.id, randomUUID());

  try {
    const created = await prisma.$transaction(async (tx) => {
      const menu = await tx.dailyMenu.create({
        data: { date, title: source.title, active: true },
      });
      if (source.meals.length > 0) {
        await tx.dailyMenuMeal.createMany({
          data: source.meals.map((meal) => ({
            id: mealIds.get(meal.id)!,
            menuId: menu.id,
            name: meal.name,
            description: meal.description,
            imageUrl: meal.imageUrl,
            availableQty: meal.availableQty,
            active: meal.active,
            order: meal.order,
          })),
        });
      }
      if (source.sizes.length > 0) {
        await tx.dailyMenuSize.createMany({
          data: source.sizes.map((size) => ({
            id: sizeIds.get(size.id)!,
            menuId: menu.id,
            name: size.name,
            description: size.description,
            active: size.active,
            order: size.order,
          })),
        });
      }
      const prices = source.meals
        .flatMap((meal) => meal.prices)
        .filter((price) => mealIds.has(price.mealId) && sizeIds.has(price.sizeId))
        .map((price) => ({
          mealId: mealIds.get(price.mealId)!,
          sizeId: sizeIds.get(price.sizeId)!,
          price: price.price,
        }));
      if (prices.length > 0) await tx.dailyMenuMealPrice.createMany({ data: prices });
      return menu;
    });

    await audit({
      userId: user.id,
      action: "CREATE",
      resource: "daily-menu",
      entityId: created.id,
      details: `Cardápio duplicado de ${source.date} para ${date}.`,
    });
    revalidateMenus();
    return { ok: true, id: created.id };
  } catch {
    return { ok: false, error: "Não foi possível duplicar o cardápio." };
  }
}

export async function saveDailyMenuMealAction(input: {
  id?: string;
  menuId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  availableQty?: number | null;
  active?: boolean;
  order?: number;
}): Promise<AdminResult<string>> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Você não tem permissão para montar cardápios." };

  const parsed = dailyMenuMealSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;
  const menu = await prisma.dailyMenu.findUnique({
    where: { id: data.menuId },
    select: { id: true },
  });
  if (!menu) return { ok: false, error: "Cardápio não encontrado." };

  let imageUrl: string | null = null;
  try {
    imageUrl = parseImageUrl(data.imageUrl);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Foto inválida." };
  }

  try {
    const meal = await prisma.dailyMenuMeal.upsert({
      where: { id: data.id ?? randomUUID() },
      create: {
        menuId: data.menuId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        imageUrl,
        availableQty: data.availableQty ?? null,
        active: data.active ?? true,
        order: data.order ?? 0,
      },
      update: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        imageUrl,
        availableQty: data.availableQty ?? null,
        active: data.active ?? true,
        order: data.order ?? 0,
      },
    });
    await audit({
      userId: user.id,
      action: data.id ? "UPDATE" : "CREATE",
      resource: "daily-menu-meal",
      entityId: meal.id,
      details: `Refeição ${meal.name}.`,
    });
    revalidateMenus();
    return { ok: true, id: meal.id };
  } catch {
    return { ok: false, error: "Não foi possível salvar a refeição." };
  }
}

export async function setDailyMenuMealActiveAction(
  id: string,
  active: boolean
): Promise<Result> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Sem permissão." };
  await prisma.dailyMenuMeal.update({ where: { id }, data: { active } });
  await audit({
    userId: user.id,
    action: "UPDATE",
    resource: "daily-menu-meal",
    entityId: id,
    details: active ? "Refeição ativada." : "Refeição desativada.",
  });
  revalidateMenus();
  return { ok: true };
}

export async function deleteDailyMenuMealAction(id: string): Promise<Result> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Sem permissão." };
  await prisma.dailyMenuMeal.delete({ where: { id } });
  await audit({
    userId: user.id,
    action: "DELETE",
    resource: "daily-menu-meal",
    entityId: id,
  });
  revalidateMenus();
  return { ok: true };
}

export async function saveDailyMenuSizeAction(input: {
  id?: string;
  menuId: string;
  name: string;
  description?: string | null;
  active?: boolean;
  order?: number;
}): Promise<AdminResult<string>> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Você não tem permissão para montar cardápios." };

  const parsed = dailyMenuSizeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;
  const menu = await prisma.dailyMenu.findUnique({
    where: { id: data.menuId },
    select: { id: true },
  });
  if (!menu) return { ok: false, error: "Cardápio não encontrado." };

  try {
    const size = await prisma.dailyMenuSize.upsert({
      where: { id: data.id ?? randomUUID() },
      create: {
        menuId: data.menuId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        active: data.active ?? true,
        order: data.order ?? 0,
      },
      update: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        active: data.active ?? true,
        order: data.order ?? 0,
      },
    });
    await audit({
      userId: user.id,
      action: data.id ? "UPDATE" : "CREATE",
      resource: "daily-menu-size",
      entityId: size.id,
      details: `Tamanho ${size.name}.`,
    });
    revalidateMenus();
    return { ok: true, id: size.id };
  } catch {
    return { ok: false, error: "Não foi possível salvar o tamanho." };
  }
}

export async function deleteDailyMenuSizeAction(id: string): Promise<Result> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Sem permissão." };
  await prisma.dailyMenuSize.delete({ where: { id } });
  await audit({
    userId: user.id,
    action: "DELETE",
    resource: "daily-menu-size",
    entityId: id,
  });
  revalidateMenus();
  return { ok: true };
}

export async function saveDailyMenuPricesAction(input: {
  menuId: string;
  prices: { mealId: string; sizeId: string; price: number }[];
}): Promise<Result> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Você não tem permissão para montar cardápios." };

  const parsed = dailyMenuPricesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Preços inválidos." };
  }
  const { menuId, prices } = parsed.data;

  const [meals, sizes] = await Promise.all([
    prisma.dailyMenuMeal.findMany({ where: { menuId }, select: { id: true } }),
    prisma.dailyMenuSize.findMany({ where: { menuId }, select: { id: true } }),
  ]);
  const mealIds = new Set(meals.map((meal) => meal.id));
  const sizeIds = new Set(sizes.map((size) => size.id));
  if (prices.some((price) => !mealIds.has(price.mealId) || !sizeIds.has(price.sizeId))) {
    return { ok: false, error: "Refeição ou tamanho não pertence a este cardápio." };
  }

  try {
    await prisma.$transaction(
      prices.map((price) =>
        prisma.dailyMenuMealPrice.upsert({
          where: { mealId_sizeId: { mealId: price.mealId, sizeId: price.sizeId } },
          create: { mealId: price.mealId, sizeId: price.sizeId, price: roundMoney(price.price) },
          update: { price: roundMoney(price.price) },
        })
      )
    );
    await audit({
      userId: user.id,
      action: "UPDATE",
      resource: "daily-menu-price",
      entityId: menuId,
      details: `${prices.length} preço(s) atualizado(s).`,
    });
    revalidateMenus();
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível salvar os preços." };
  }
}

export type DailyMenuOrderResult =
  | { ok: true; orderId: string; number: number; total: number }
  | { ok: false; error: string };

/** Pedido do cliente: escolhe refeição completa + tamanho, nunca ingredientes. */
export async function createDailyMenuOrderAction(
  input: {
    mealId: string;
    sizeId: string;
    quantity: number;
    paymentMethod: "CASH" | "CARD" | "PIX";
    observation?: string | null;
    recipientName?: string;
    recipientPhone?: string;
    recipientAddress?: string | null;
    delivery?: { mode: "PICKUP" | "DELIVERY"; address?: {
      street: string;
      number: string;
      complement?: string | null;
      neighborhood: string;
      city: string;
      state: string;
      zipCode: string;
    } };
  }
): Promise<DailyMenuOrderResult> {
  const session = await auth();
  if (!session?.user || session.user.userType !== UserType.CUSTOMER) {
    return { ok: false, error: "Entre como cliente para pedir uma marmita." };
  }

  const parsed = dailyMenuOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados do pedido inválidos." };
  }
  const data = parsed.data;

  const context = await getStoreContext();
  if (!context.open) {
    return { ok: false, error: "O estabelecimento está fechado no momento." };
  }

  const today = businessDate();
  const menu = await prisma.dailyMenu.findUnique({
    where: { date: today },
    select: { id: true, date: true, active: true },
  });
  if (!menu || !menu.active) {
    return { ok: false, error: "O cardápio de hoje não está disponível." };
  }

  const [meal, size, price] = await Promise.all([
    prisma.dailyMenuMeal.findFirst({
      where: { id: data.mealId, menuId: menu.id, active: true },
      select: { id: true, name: true, availableQty: true },
    }),
    prisma.dailyMenuSize.findFirst({
      where: { id: data.sizeId, menuId: menu.id, active: true },
      select: { id: true, name: true },
    }),
    prisma.dailyMenuMealPrice.findUnique({
      where: { mealId_sizeId: { mealId: data.mealId, sizeId: data.sizeId } },
      select: { price: true },
    }),
  ]);

  if (!meal || !size) return { ok: false, error: "Refeição ou tamanho indisponível." };
  if (meal.availableQty !== null && meal.availableQty < data.quantity) {
    return { ok: false, error: `${meal.name} esgotado ou com quantidade insuficiente.` };
  }
  if (!price) {
    return { ok: false, error: "Preço não cadastrado para esta combinação." };
  }

  const mode = data.delivery?.mode ?? DeliveryMode.PICKUP;
  if (mode === DeliveryMode.DELIVERY && !context.settings.deliveryEnabled) {
    return { ok: false, error: "A entrega não está disponível no momento." };
  }
  const address = data.delivery?.address;
  if (mode === DeliveryMode.DELIVERY && !address) {
    return { ok: false, error: "Informe o endereço de entrega." };
  }

  const deliveryFee = mode === DeliveryMode.DELIVERY ? roundMoney(context.settings.deliveryFee) : 0;
  const subtotal = roundMoney(price.price * data.quantity);
  const total = roundMoney(subtotal + deliveryFee);

  const customer = await prisma.user.findFirst({
    where: { id: session.user.id, userType: UserType.CUSTOMER, active: true },
    select: { id: true, name: true, phone: true, defaultObservation: true },
  });
  if (!customer) return { ok: false, error: "Cliente não encontrado. Entre novamente." };

  const addressSnapshot = address
    ? `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ""} — ${address.neighborhood}, ${address.city}/${address.state} — CEP ${address.zipCode}`.slice(0, 300)
    : null;
  const observation =
    data.observation?.trim() || customer.defaultObservation || null;

  try {
    const order = await prisma.$transaction(async (tx) => {
      if (meal.availableQty !== null) {
        const updated = await tx.dailyMenuMeal.updateMany({
          where: { id: meal.id, availableQty: { gte: data.quantity } },
          data: { availableQty: { decrement: data.quantity } },
        });
        if (updated.count !== 1) {
          throw new Error("Esse item acabou de esgotar. Escolha outra refeição.");
        }
      }

      const created = await tx.order.create({
        data: {
          customerId: customer.id,
          status: OrderStatus.NEW,
          paymentMethod: data.paymentMethod,
          paymentStatus: PaymentStatus.PENDING,
          subtotal,
          total,
          deliveryMode: mode,
          deliveryFee,
          observation,
          recipientName: data.recipientName?.trim() || customer.name,
          recipientPhone: data.recipientPhone || customer.phone || null,
          recipientAddress: addressSnapshot,
          items: {
            create: {
              productName: `${meal.name} · ${size.name}`,
              unitPrice: roundMoney(price.price),
              quantity: data.quantity,
              subtotal,
              dailyMenuMealId: meal.id,
              dailyMenuSizeId: size.id,
            },
          },
          history: { create: { toStatus: OrderStatus.NEW, userId: customer.id } },
          payment: {
            create: {
              method: data.paymentMethod,
              status: PaymentStatus.PENDING,
              amount: total,
            },
          },
          ...(mode === DeliveryMode.DELIVERY && address
            ? {
                delivery: {
                  create: {
                    mode: DeliveryMode.DELIVERY,
                    status: DeliveryStatus.PENDING,
                    fee: deliveryFee,
                    addressSnapshot: { ...address, recipientName: data.recipientName || customer.name } as object,
                  },
                },
              }
            : {}),
        },
      });

      await tx.notification.create({
        data: {
          userId: null,
          type: "NEW_ORDER",
          title: `Novo pedido de marmita #${created.number}`,
          body: `${customer.name} — ${meal.name} (${size.name}) × ${data.quantity} — ${formatCurrency(total)}.`,
          link: "/admin/pedidos",
        },
      });
      await tx.notification.create({
        data: {
          userId: customer.id,
          type: "ORDER_STATUS",
          title: `Pedido de marmita #${created.number} recebido`,
          body: `${meal.name} · ${size.name} × ${data.quantity}. Acompanhe seu pedido.`,
          link: `/pedido/${created.id}`,
        },
      });

      return created;
    });

    return { ok: true, orderId: order.id, number: order.number, total: order.total };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível registrar o pedido.",
    };
  }
}
