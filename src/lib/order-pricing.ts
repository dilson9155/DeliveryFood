import { roundMoney } from "@/lib/format";
import type { OptionSelection } from "@/lib/product-options";

/**
 * Regras de preço compartilhadas entre PDV, loja online e comandas.
 * O cliente envia apenas IDs e quantidades; nomes e preços são sempre
 * recalculados aqui a partir do cadastro.
 */
export type PricingProduct = {
  id: string;
  name: string;
  price: number;
  optionGroups: {
    id: string;
    name: string;
    required: boolean;
    minQuantity: number;
    maxQuantity: number;
    options: { id: string; name: string; price: number }[];
  }[];
};

export type PricingItemInput = {
  productId: string;
  quantity: number;
  options?: OptionSelection[];
};

export type PricedItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  options: {
    groupId: string;
    optionId: string;
    groupName: string;
    optionName: string;
    quantity: number;
    unitPrice: number;
  }[];
};

export type PricingResult =
  | { ok: true; items: PricedItem[]; total: number }
  | { ok: false; error: string };

export function priceItems(
  input: PricingItemInput[],
  products: PricingProduct[]
): PricingResult {
  const productMap = new Map(products.map((product) => [product.id, product]));
  let total = 0;
  const items: PricedItem[] = [];

  for (const item of input) {
    const product = productMap.get(item.productId);
    if (!product) return { ok: false, error: "Produto indisponível." };

    const selections = item.options ?? [];
    let unitPrice = product.price;
    const options: PricedItem["options"] = [];

    for (const selection of selections) {
      const group = product.optionGroups.find((g) => g.id === selection.groupId);
      if (!group) return { ok: false, error: `Escolha inválida em ${product.name}.` };
      const option = group.options.find((o) => o.id === selection.optionId);
      if (!option) return { ok: false, error: `Opção indisponível em ${product.name}.` };

      unitPrice = roundMoney(unitPrice + option.price * selection.quantity);
      options.push({
        groupId: group.id,
        optionId: option.id,
        groupName: group.name,
        optionName: option.name,
        quantity: selection.quantity,
        unitPrice: option.price,
      });
    }

    for (const group of product.optionGroups) {
      const chosen = selections
        .filter((selection) => selection.groupId === group.id)
        .reduce((sum, selection) => sum + selection.quantity, 0);
      if (group.required && chosen < group.minQuantity) {
        return {
          ok: false,
          error: `${product.name}: escolha ${group.minQuantity} opção(ões) em "${group.name}".`,
        };
      }
      if (chosen > group.maxQuantity) {
        return {
          ok: false,
          error: `${product.name}: no máximo ${group.maxQuantity} opção(ões) em "${group.name}".`,
        };
      }
    }

    const subtotal = roundMoney(unitPrice * item.quantity);
    total = roundMoney(total + subtotal);
    items.push({
      productId: product.id,
      productName: product.name,
      unitPrice,
      quantity: item.quantity,
      subtotal,
      options,
    });
  }

  return { ok: true, items, total };
}
