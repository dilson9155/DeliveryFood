"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Pencil, Star, Power, PowerOff, ImageOff, Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Label, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty";
import { formatCurrency } from "@/lib/format";
import { saveProductAction, toggleProductActiveAction } from "@/app/actions/admin";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  categoryId: string;
  imageUrl: string | null;
  featured: boolean;
  order: number;
  active: boolean;
  category: { name: string } | null;
};

type Category = { id: string; name: string; active: boolean };

export function ProductsPanel({
  products,
  categories,
}: {
  products: Product[];
  categories: Category[];
}) {
  const { show } = useToast();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        const q = query.toLowerCase();
        return (
          (!categoryFilter || p.categoryId === categoryFilter) &&
          (!q || p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q))
        );
      }),
    [products, query, categoryFilter]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie o cardápio. Produtos desativados não aparecem para clientes.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
        >
          <Plus className="h-4 w-4" /> Novo produto
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produto..."
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="sm:w-56">
          <option value="">Todas as categorias</option>
          {categories.filter((c) => c.active).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="Nenhum produto encontrado"
          description="Crie um novo produto ou ajuste a busca."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Card key={p.id} className={!p.active ? "opacity-60" : ""}>
              <CardContent className="flex gap-3 p-4">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <ImageOff className="h-6 w-6" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-bold">{p.name}</p>
                    {p.featured && <Star className="h-4 w-4 shrink-0 text-brand-600 fill-brand-600" />}
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-brand-700">{formatCurrency(p.price)}</span>
                    <Badge>{p.category?.name ?? "Sem categoria"}</Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setCreating(false); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        startTransition(async () => {
                          const res = await toggleProductActiveAction(p.id, !p.active);
                          if (res.ok) show("success", "Produto " + (p.active ? "desativado" : "ativado"));
                          else show("error", res.error);
                        })
                      }
                    >
                      {p.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <ProductForm
          product={editing}
          categories={categories}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ProductForm({
  product,
  categories,
  onClose,
}: {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
}) {
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product ? String(product.price) : "",
    categoryId: product?.categoryId ?? categories.find((c) => c.active)?.id ?? "",
    imageUrl: product?.imageUrl ?? "",
    featured: product?.featured ?? false,
    order: product?.order ?? 0,
    active: product?.active ?? true,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    const price = parseFloat(form.price.replace(",", "."));
    startTransition(async () => {
      const res = await saveProductAction({
        id: product?.id,
        name: form.name,
        description: form.description || null,
        price: isNaN(price) ? 0 : price,
        categoryId: form.categoryId,
        imageUrl: form.imageUrl || null,
        featured: form.featured,
        order: form.order,
        active: form.active,
      });
      if (res.ok) {
        show("success", product ? "Produto atualizado." : "Produto criado.");
        onClose();
      } else {
        show("error", res.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background shadow-2xl animate-fade-in sm:rounded-3xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-background px-5 py-4">
          <h2 className="text-base font-bold">{product ? "Editar produto" : "Novo produto"}</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Descrição do produto"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="price">Preço (R$)</Label>
              <Input id="price" value={form.price} onChange={(e) => set("price", e.target.value)} inputMode="decimal" placeholder="0,00" required />
            </div>
            <div>
              <Label htmlFor="category">Categoria</Label>
              <Select id="category" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                {categories.filter((c) => c.active).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="imageUrl">URL da imagem (opcional)</Label>
            <Input id="imageUrl" value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="order">Ordem de exibição</Label>
              <Input id="order" type="number" value={form.order} onChange={(e) => set("order", parseInt(e.target.value) || 0)} />
            </div>
            <div className="flex items-end gap-3">
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => set("featured", !form.featured)}
              >
                {form.featured ? <Star className="h-4 w-4 fill-brand-600 text-brand-600" /> : <Star className="h-4 w-4" />}
                {form.featured ? "Destaque" : "Destaque"}
              </Button>
              <Button
                size="sm"
                type="button"
                variant={form.active ? "success" : "secondary"}
                onClick={() => set("active", !form.active)}
              >
                {form.active ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                {form.active ? "Ativo" : "Inativo"}
              </Button>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" size="lg" disabled={isPending || !form.name || !form.categoryId} onClick={submit}>
              {isPending ? "Salvando..." : "Salvar produto"}
            </Button>
            <Button size="lg" variant="ghost" onClick={onClose}>Cancelar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}