"use client";

import { useState } from "react";
import { Check, Minus, Plus, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import type { OptionChoice, OptionGroupView } from "@/lib/product-options";

type ProductSummary = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
};

export function ProductConfigurator({
  product,
  groups,
  onAdd,
  onClose,
}: {
  product: ProductSummary;
  groups: OptionGroupView[];
  onAdd: (choices: OptionChoice[], unitPrice: number) => void;
  onClose: () => void;
}) {
  const [counts, setCounts] = useState<Record<string, Record<string, number>>>(() => {
    const initial: Record<string, Record<string, number>> = {};
    for (const group of groups) {
      if (group.required && group.minQuantity > 0 && group.options.length > 0) {
        initial[group.id] = { [group.options[0].id]: group.minQuantity };
      }
    }
    return initial;
  });

  const countOf = (groupId: string, optionId: string) => counts[groupId]?.[optionId] ?? 0;
  const groupTotal = (groupId: string) =>
    Object.values(counts[groupId] ?? {}).reduce((sum, n) => sum + n, 0);

  function change(groupId: string, optionId: string, delta: number) {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const current = countOf(groupId, optionId);
    if (current + delta < 0) return;
    if (delta > 0 && groupTotal(groupId) + delta > group.maxQuantity) return;
    setCounts((prev) => {
      const groupCounts = { ...(prev[groupId] ?? {}) };
      const next = current + delta;
      if (next <= 0) delete groupCounts[optionId];
      else groupCounts[optionId] = next;
      return { ...prev, [groupId]: groupCounts };
    });
  }

  const extras = groups.reduce(
    (sum, group) =>
      sum +
      group.options.reduce(
        (sub, option) => sub + option.price * countOf(group.id, option.id),
        0
      ),
    0
  );
  const unitPrice = product.price + extras;

  const invalidGroups = groups.filter((group) => {
    const total = groupTotal(group.id);
    if (!group.required && total === 0) return false;
    return total < group.minQuantity || total > group.maxQuantity;
  });

  function confirm() {
    if (invalidGroups.length > 0) return;
    const choices: OptionChoice[] = [];
    for (const group of groups) {
      for (const option of group.options) {
        const quantity = countOf(group.id, option.id);
        if (quantity <= 0) continue;
        choices.push({
          groupId: group.id,
          optionId: option.id,
          groupName: group.name,
          optionName: option.name,
          quantity,
          unitPrice: option.price,
        });
      }
    }
    onAdd(choices, unitPrice);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Settings2 className="h-5 w-5 text-brand-600" />
              Monte seu marmitex
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{product.name}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {groups.map((group) => {
            const total = groupTotal(group.id);
            return (
              <section key={group.id}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold">
                      {group.name}
                      {!group.required && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">opcional</span>
                      )}
                    </h3>
                    {group.description && (
                      <p className="text-xs text-muted-foreground">{group.description}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      total >= group.minQuantity && total <= group.maxQuantity
                        ? "bg-brand-50 text-brand-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {total}/{group.maxQuantity}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {group.options.map((option) => {
                    const quantity = countOf(group.id, option.id);
                    return (
                      <div
                        key={option.id}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                          quantity > 0 ? "border-brand-400 bg-brand-50" : "border-border bg-card"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{option.name}</p>
                          {option.price > 0 && (
                            <p className="text-xs text-brand-700">
                              + {formatCurrency(option.price)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => change(group.id, option.id, -1)}
                            disabled={quantity === 0}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border disabled:opacity-40"
                            aria-label={`Remover ${option.name}`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-5 text-center text-sm font-semibold">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => change(group.id, option.id, 1)}
                            disabled={total >= group.maxQuantity}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border disabled:opacity-40"
                            aria-label={`Adicionar ${option.name}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {total < group.minQuantity && (
                  <p className="mt-1.5 text-xs text-danger">
                    Escolha {group.minQuantity === 1 ? "1 opção" : `pelo menos ${group.minQuantity} opções`}.
                  </p>
                )}
              </section>
            );
          })}
        </div>

        <div className="space-y-3 border-t border-border px-5 py-4">
          {invalidGroups.length > 0 && (
            <p className="text-xs text-danger">
              Confira as escolhas obrigatórias antes de adicionar ao carrinho.
            </p>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Base {formatCurrency(product.price)}
              {extras > 0 && ` + adicionais ${formatCurrency(extras)}`}
            </span>
            <span className="text-lg font-extrabold text-brand-700">
              {formatCurrency(unitPrice)}
            </span>
          </div>
          <Button className="w-full" disabled={invalidGroups.length > 0} onClick={confirm}>
            <Check className="h-4 w-4" /> Adicionar ao carrinho
          </Button>
        </div>
      </div>
    </div>
  );
}
