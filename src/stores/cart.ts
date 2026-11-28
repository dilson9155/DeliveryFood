"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { cartItemKey, type OptionChoice } from "@/lib/product-options";

export type CartItem = {
  productId: string;
  name: string;
  /** Preço unitário já incluindo os adicionais das opções escolhidas. */
  unitPrice: number;
  quantity: number;
  imageUrl?: string | null;
  maxQuantity?: number;
  options?: OptionChoice[];
  /** Marmita do dia: preço e estoque são revalidados no servidor. */
  special?: { kind: "DAILY"; mealId: string; sizeId: string };
};

type CartState = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (key: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) =>
        set((state) => {
          const key = cartItemKey(item.productId, item.options);
          const existing = state.items.find((i) => cartItemKey(i.productId, i.options) === key);
          if (existing) {
            return {
              items: state.items.map((i) =>
                cartItemKey(i.productId, i.options) === key
                  ? { ...i, quantity: Math.min(i.quantity + (item.quantity ?? 1), i.maxQuantity ?? Infinity) }
                  : i
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity: item.quantity ?? 1 }] };
        }),
      removeItem: (key) =>
        set((state) => ({
          items: state.items.filter((i) => cartItemKey(i.productId, i.options) !== key),
        })),
      setQuantity: (key, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => cartItemKey(i.productId, i.options) !== key)
              : state.items.map((i) =>
                  cartItemKey(i.productId, i.options) === key
                    ? { ...i, quantity: Math.min(quantity, i.maxQuantity ?? Infinity) }
                    : i
                ),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: "delivery-food-cart" }
  )
);

export function cartSubtotal(items: CartItem[]) {
  return items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
}
