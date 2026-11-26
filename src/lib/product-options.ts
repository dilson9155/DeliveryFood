/** Tipos e helpers compartilhados entre loja, carrinho e pedido (sem dependência de servidor). */

/** Seleção enviada pelo cliente: apenas ids e quantidade — preço/nome são recalculados no servidor. */
export type OptionSelection = {
  groupId: string;
  optionId: string;
  quantity: number;
};

/** Seleção já materializada no carrinho/pedido. */
export type OptionChoice = OptionSelection & {
  groupName: string;
  optionName: string;
  unitPrice: number;
};

export type OptionGroupView = {
  id: string;
  name: string;
  description: string | null;
  minQuantity: number;
  maxQuantity: number;
  required: boolean;
  order: number;
  options: {
    id: string;
    name: string;
    price: number;
    order: number;
  }[];
};

export function hasOptions(product?: { optionGroups?: unknown[] } | null): boolean {
  return Boolean(product?.optionGroups && product.optionGroups.length > 0);
}

/** Identifica o item no carrinho: produto + combinação exata de escolhas. */
export function cartItemKey(productId: string, options?: OptionChoice[]): string {
  if (!options || options.length === 0) return productId;
  const suffix = options
    .map((o) => `${o.groupId}:${o.optionId}:${o.quantity}`)
    .sort()
    .join(",");
  return `${productId}|${suffix}`;
}

export function optionsExtra(options?: OptionChoice[]): number {
  return (options ?? []).reduce((sum, o) => sum + o.unitPrice * o.quantity, 0);
}

/** Resumo legível das escolhas, usado em carrinho, recibo e comandas. */
export function describeOptions(
  options?: { groupName: string; optionName: string; quantity: number }[]
): string {
  return (options ?? [])
    .map((o) => `${o.groupName}: ${o.quantity}× ${o.optionName}`)
    .join(" · ");
}
