"use client";

import { useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import { useCart } from "@/stores/cart";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { formatCurrency } from "@/lib/format";

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
};

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
  open,
}: {
  categories: Category[];
  products: Product[];
  open: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { addItem } = useCart();
  const { show } = useToast();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const matchCategory = !selected || p.categoryId === selected;
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q);
      return matchCategory && matchQuery;
    });
  }, [products, query, selected]);

  return (
    <div className="container-store py-6">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          O que vamos pedir hoje?
        </h1>
        <p className="text-sm text-muted-foreground">
          Pedido para retirada no estabelecimento. Pagamento na retirada.
        </p>
      </div>

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

      {filtered.length === 0 ? (
        <EmptyState
          icon={query || selected ? <Search className="h-8 w-8" /> : <span>🍽️</span>}
          title={query || selected ? "Nenhum produto encontrado" : "Não encontramos produtos nessa categoria"}
          description="Tente buscar por outro nome ou selecione outra categoria."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              open={open}
              onAdd={() => {
                addItem({
                  productId: p.id,
                  name: p.name,
                  unitPrice: p.price,
                  imageUrl: p.imageUrl,
                });
                show("success", `${p.name} adicionado ao carrinho`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({
  product,
  open,
  onAdd,
}: {
  product: Product;
  open: boolean;
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
            title={!open ? "Estabelecimento fechado" : `Adicionar ${product.name}`}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}