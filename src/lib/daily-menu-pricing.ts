import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { businessDate } from "@/lib/daily-menu";
import { roundMoney } from "@/lib/format";
import type { PricedItem } from "@/lib/order-pricing";

/**
 * Revalida marmitas do dia no servidor para PDV e loja online.
 * Nenhum nome ou preço vindo do navegador é aceito: tudo é lido do cardápio
 * vigente e o estoque é devolvido como reserva para baixa atômica na transação.
 */
export type DailyCartSelection = {
  mealId: string;
  sizeId: string;
  quantity: number;
};

export type PricedDailyItem = {
  productId: null;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  options: PricedItem["options"];
  dailyMenuMealId: string;
  dailyMenuSizeId: string;
};

export type DailyStockReservation = {
  id: string;
  name: string;
  quantity: number;
  unlimited: boolean;
};

export type DailyPricingResult =
  | { ok: true; items: PricedDailyItem[]; stock: DailyStockReservation[] }
  | { ok: false; error: string };

export async function priceDailyItems(
  inputs: DailyCartSelection[]
): Promise<DailyPricingResult> {
  if (inputs.length === 0) return { ok: true, items: [], stock: [] };

  const menu = await prisma.dailyMenu.findUnique({
    where: { date: businessDate() },
    select: { id: true, active: true },
  });
  if (!menu?.active) {
    return { ok: false, error: "O cardápio de hoje não está disponível." };
  }

  const selections = new Map<string, DailyCartSelection>();
  for (const item of inputs) {
    const key = `${item.mealId}:${item.sizeId}`;
    const current = selections.get(key);
    if (current) current.quantity += item.quantity;
    else
      selections.set(key, {
        mealId: item.mealId,
        sizeId: item.sizeId,
        quantity: item.quantity,
      });
  }
  const merged = [...selections.values()];
  const mealIds = [...new Set(merged.map((item) => item.mealId))];
  const sizeIds = [...new Set(merged.map((item) => item.sizeId))];

  const [meals, sizes, prices] = await Promise.all([
    prisma.dailyMenuMeal.findMany({
      where: { id: { in: mealIds }, menuId: menu.id, active: true },
      select: { id: true, name: true, availableQty: true },
    }),
    prisma.dailyMenuSize.findMany({
      where: { id: { in: sizeIds }, menuId: menu.id, active: true },
      select: { id: true, name: true },
    }),
    prisma.dailyMenuMealPrice.findMany({
      where: { mealId: { in: mealIds }, sizeId: { in: sizeIds } },
      select: { mealId: true, sizeId: true, price: true },
    }),
  ]);

  const requiredByMeal = new Map<string, number>();
  for (const selection of merged) {
    requiredByMeal.set(
      selection.mealId,
      (requiredByMeal.get(selection.mealId) ?? 0) + selection.quantity
    );
  }
  for (const [mealId, quantity] of requiredByMeal) {
    const meal = meals.find((row) => row.id === mealId);
    if (!meal) return { ok: false, error: "Uma refeição selecionada não está disponível hoje." };
    if (meal.availableQty !== null && meal.availableQty < quantity) {
      return { ok: false, error: `${meal.name} esgotado ou com quantidade insuficiente.` };
    }
  }

  const items: PricedDailyItem[] = [];
  for (const selection of merged) {
    const meal = meals.find((row) => row.id === selection.mealId)!;
    const size = sizes.find((row) => row.id === selection.sizeId);
    if (!size) return { ok: false, error: "O tamanho selecionado não está disponível hoje." };
    const price = prices.find(
      (row) => row.mealId === selection.mealId && row.sizeId === selection.sizeId
    );
    if (!price) {
      return { ok: false, error: `Preço não cadastrado para ${meal.name} · ${size.name}.` };
    }
    items.push({
      productId: null,
      productName: `${meal.name} · ${size.name}`,
      unitPrice: roundMoney(price.price),
      quantity: selection.quantity,
      subtotal: roundMoney(price.price * selection.quantity),
      options: [],
      dailyMenuMealId: meal.id,
      dailyMenuSizeId: size.id,
    });
  }

  const stock: DailyStockReservation[] = [...requiredByMeal].map(([mealId, quantity]) => {
    const meal = meals.find((row) => row.id === mealId)!;
    return {
      id: meal.id,
      name: meal.name,
      quantity,
      unlimited: meal.availableQty === null,
    };
  });

  return { ok: true, items, stock };
}

export async function reserveDailyStock(
  tx: Prisma.TransactionClient,
  stock: DailyStockReservation[]
): Promise<void> {
  for (const entry of stock) {
    if (entry.unlimited) continue;
    const updated = await tx.dailyMenuMeal.updateMany({
      where: { id: entry.id, availableQty: { gte: entry.quantity } },
      data: { availableQty: { decrement: entry.quantity } },
    });
    if (updated.count !== 1) {
      throw new Error(`${entry.name} acabou de esgotar. Escolha outra refeição no carrinho.`);
    }
  }
}
