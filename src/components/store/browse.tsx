"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Flame, Soup } from "lucide-react";
import { useCart } from "@/stores/cart";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { formatCurrency } from "@/lib/format";
import { ProductConfigurator } from "@/components/store/product-configurator";
import type { OptionChoice, OptionGroupView } from "@/lib/product-options";

type Category = {
  id: string;
  name: string;
  icon: string | null;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  categoryId: string;
  featured: boolean;
};

type DailyMeal = {
  mealId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  availableQty: number | null;
  sizes: { id: string; name: string; price: number }[];
};

const DAILY_CATEGORY_ID = "daily";

const CATEGORY_FALLBACK_ICONS: Record<string, string> = {
  Lanches: "🍔",
  Pizzas: "🍕",
  Porções: "🍟",
  Bebidas: "🥤",
  Sobremesas: "🍰",
  Combos: "🔥",
};

export function Browse({
  categories,
  products,
  optionGroupsByProduct,
  dailyMeals = [],
  open,
}: {
  categories: Category[];
  products: Product[];
  optionGroupsByProduct: Record<string, OptionGroupView[]>;
  dailyMeals?: DailyMeal[];
  open: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<Record<string, string>>({});
  const [configuring, setConfiguring] = useState<Product | null>(null);
  const { addItem } = useCart();
  const { show } = useToast();

  function addSimple(product: Product) {
    addItem({
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      imageUrl: product.imageUrl,
    });
    show("success", `${product.name} adicionado ao carrinho`);
  }

  function handleAdd(product: Product) {
    const groups = optionGroupsByProduct[product.id] ?? [];
    if (groups.length > 0) {
      setConfiguring(product);
      return;
    }
    addSimple(product);
  }

  function handleConfigured(choices: OptionChoice[], unitPrice: number) {
    const product = configuring;
    if (!product) return;
    addItem({
      productId: product.id,
      name: product.name,
      unitPrice,
      imageUrl: product.imageUrl,
      options: choices,
    });
    show("success", `${product.name} montado e adicionado ao carrinho`);
    setConfiguring(null);
  }

  function addDailyMeal(meal: DailyMeal, sizeId: string) {
    const size = meal.sizes.find((row) => row.id === sizeId);
    if (!size) return;
    addItem({
      productId: `daily:${meal.mealId}:${size.id}`,
      name: `${meal.name} · ${size.name}`,
      unitPrice: size.price,
      imageUrl: meal.imageUrl,
      maxQuantity: meal.availableQty ?? undefined,
      special: { kind: "DAILY", mealId: meal.mealId, sizeId: size.id },
    });
    show("success", `${meal.name} · ${size.name} adicionado ao carrinho`);
  }

  const q = query.trim().toLowerCase();
  const filteredProducts = useMemo(
    () =>
      products.filter((p) => {
        if (selected === DAILY_CATEGORY_ID) return false;
        const matchCategory = !selected || p.categoryId === selected;
        const matchQuery =
          !q || p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q);
        return matchCategory && matchQuery;
      }),
    [products, query, selected]
  );

  const filteredDaily = useMemo(
    () =>
      dailyMeals.filter((meal) => {
        if (selected && selected !== DAILY_CATEGORY_ID) return false;
        return !q || meal.name.toLowerCase().includes(q) || (meal.description ?? "").toLowerCase().includes(q);
      }),
    [dailyMeals, query, selected]
  );

  return (
    <div className="container-store py-6">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          O que vamos pedir hoje?
        </h1>
        <p className="text-sm text-muted-foreground">
          Monte seu pedido online e retire no balcão. Pague com PIX, dinheiro ou cartão.
        </p>
      </div>

      {products.some((p) => p.featured) && (
        <section className="mb-7">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Flame className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-extrabold tracking-tight sm:text-lg">
                Cardápio do dia
              </h2>
              <p className="text-xs text-muted-foreground">
                Os destaques de hoje, prontos para você pedir.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products
              .filter((p) => p.featured)
              .map((p) => (
                <ProductCard
                  key={`daily-${p.id}`}
                  product={p}
                  open={open}
                  configurable={(optionGroupsByProduct[p.id] ?? []).length > 0}
                  onAdd={() => handleAdd(p)}
                />
              ))}
          </div>
        </section>
      )}

      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar produto..."
          className="h-12 w-full rounded-2xl border border-border bg-card pl-11 pr-4 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>

      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:flex-wrap">
        <button
          onClick={() => setSelected(null)}
          className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
            selected === null
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-border bg-card hover:bg-muted"
          }`}
        >
          Todos
        </button>
        {dailyMeals.length > 0 && (
          <button
            onClick={() => setSelected(DAILY_CATEGORY_ID)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              selected === DAILY_CATEGORY_ID
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            <span className="mr-1">🍱</span>
            Marmitas do dia
          </button>
        )}
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              selected === c.id
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            <span className="mr-1">{c.icon ?? CATEGORY_FALLBACK_ICONS[c.name] ?? "🍽️"}</span>
            {c.name}
          </button>
        ))}
      </div>

      {filteredDaily.length === 0 && filteredProducts.length === 0 ? (
        <EmptyState
          icon={query || selected ? <Search className="h-8 w-8" /> : <span>🍽️</span>}
          title={query || selected ? "Nenhum item encontrado" : "Não encontramos itens nessa categoria"}
          description="Tente buscar por outro nome ou selecione outra categoria."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDaily.map((meal) => (
            <DailyMealCard
              key={meal.mealId}
              meal={meal}
              open={open}
              sizeId={selectedSize[meal.mealId] ?? meal.sizes[0]?.id ?? ""}
              onSizeChange={(sizeId) =>
                setSelectedSize((prev) => ({ ...prev, [meal.mealId]: sizeId }))
              }
              onAdd={(sizeId) => addDailyMeal(meal, sizeId)}
            />
          ))}
          {filteredProducts.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              open={open}
              configurable={(optionGroupsByProduct[p.id] ?? []).length > 0}
              onAdd={() => handleAdd(p)}
            />
          ))}
        </div>
      )}
      {configuring && (
        <ProductConfigurator
          product={configuring}
          groups={optionGroupsByProduct[configuring.id] ?? []}
          onAdd={handleConfigured}
          onClose={() => setConfiguring(null)}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  open,
  configurable,
  onAdd,
}: {
  product: Product;
  open: boolean;
  configurable: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex gap-3.5 rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md">
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt={product.name}
          className="h-24 w-24 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-3xl">
          {CATEGORY_FALLBACK_ICONS[product.name] ?? "🍽️"}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-sm font-bold leading-snug">{product.name}</h3>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {product.description}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-base font-extrabold text-brand-700">
            {formatCurrency(product.price)}
          </span>
          <Button
            size="sm"
            disabled={!open}
            onClick={onAdd}
            className="h-8 gap-1 rounded-xl px-3 text-xs"
            title={!open ? "Estabelecimento fechado" : `${configurable ? "Montar" : "Adicionar"} ${product.name}`}
          >
            <Plus className="h-3.5 w-3.5" />
            {configurable ? "Montar" : "Adicionar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DailyMealCard({
  meal,
  open,
  sizeId,
  onSizeChange,
  onAdd,
}: {
  meal: DailyMeal;
  open: boolean;
  sizeId: string;
  onSizeChange: (sizeId: string) => void;
  onAdd: (sizeId: string) => void;
}) {
  const size = meal.sizes.find((row) => row.id === sizeId) ?? meal.sizes[0];
  const soldOut = meal.availableQty === 0;

  return (
    <div className="flex gap-3.5 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/70 to-card p-3.5 shadow-sm transition-shadow hover:shadow-md">
      {meal.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meal.imageUrl}
          alt={meal.name}
          className="h-24 w-24 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-3xl">
          🍱
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-bold leading-snug">{meal.name}</h3>
          <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            Marmita do dia
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {meal.description || "Refeição completa do dia."}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {meal.sizes.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSizeChange(option.id)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                size?.id === option.id
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-border bg-card text-muted-foreground hover:border-brand-300"
              }`}
            >
              {option.name} · {formatCurrency(option.price)}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] font-medium text-muted-foreground">
          {meal.availableQty === null
            ? "Sem limite de quantidade"
            : soldOut
              ? "Esgotado por hoje"
              : `${meal.availableQty} unidade(s) restante(s)`}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-base font-extrabold text-brand-700">
            {size ? formatCurrency(size.price) : "—"}
          </span>
          <Button
            size="sm"
            disabled={!open || !size || soldOut}
            onClick={() => size && onAdd(size.id)}
            className="h-8 gap-1 rounded-xl px-3 text-xs"
            title={!open ? "Estabelecimento fechado" : `Adicionar ${meal.name}`}
          >
            <Soup className="h-3.5 w-3.5" />
            Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}