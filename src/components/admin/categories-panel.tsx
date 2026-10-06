"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Power, PowerOff, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { saveCategoryAction, toggleCategoryActiveAction } from "@/app/actions/admin";

type Category = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  order: number;
  active: boolean;
  _count: { products: number };
};

export function CategoriesPanel({ categories: initial }: { categories: Category[] }) {
  const { show } = useToast();
  const [, startTransition] = useTransition();
  const [categories, setCategories] = useState(initial);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Categorias</h1>
          <p className="text-sm text-muted-foreground">
            Organize seus produtos em categorias.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
        >
          <Plus className="h-4 w-4" /> Nova categoria
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <Card key={c.id} className={!c.active ? "opacity-60" : ""}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-xl">
                {c.icon ?? "🍽️"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.description ?? "Sem descrição"} · {c._count.products} produto(s)
                </p>
              </div>
              <Badge tone={c.active ? "success" : "muted"}>{c.active ? "Ativa" : "Inativa"}</Badge>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(c);
                    setCreating(false);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    startTransition(async () => {
                      const res = await toggleCategoryActiveAction(c.id, !c.active);
                      if (res.ok) {
                        show("success", "Categoria " + (c.active ? "desativada" : "ativada"));
                        setCategories((prev) =>
                          prev.map((x) => (x.id === c.id ? { ...x, active: !c.active } : x))
                        );
                      } else show("error", res.error);
                    })
                  }
                >
                  {c.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {(creating || editing) && (
        <CategoryForm
          category={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CategoryForm({
  category,
  onClose,
}: {
  category: Category | null;
  onClose: () => void;
}) {
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: category?.name ?? "",
    description: category?.description ?? "",
    icon: category?.icon ?? "",
    order: category?.order ?? 0,
    active: category?.active ?? true,
  });

  function submit() {
    startTransition(async () => {
      const res = await saveCategoryAction({
        id: category?.id,
        name: form.name,
        description: form.description || null,
        icon: form.icon || null,
        order: form.order,
        active: form.active,
      });
      if (res.ok) {
        show("success", category ? "Categoria atualizada." : "Categoria criada.");
        onClose();
      } else {
        show("error", res.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background shadow-2xl animate-fade-in sm:rounded-3xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-background px-5 py-4">
          <h2 className="text-base font-bold">{category ? "Editar categoria" : "Nova categoria"}</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <Label htmlFor="cat-name">Nome</Label>
            <Input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="cat-icon">Ícone (emoji opcional)</Label>
            <Input id="cat-icon" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="🍔" />
          </div>
          <div>
            <Label htmlFor="cat-desc">Descrição</Label>
            <Input id="cat-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="cat-order">Ordem de exibição</Label>
            <Input
              id="cat-order"
              type="number"
              value={form.order}
              onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Status</span>
            <Button
              size="sm"
              variant={form.active ? "success" : "secondary"}
              onClick={() => setForm({ ...form, active: !form.active })}
            >
              {form.active ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
              {form.active ? "Ativa" : "Inativa"}
            </Button>
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" size="lg" disabled={isPending || !form.name} onClick={submit}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button size="lg" variant="ghost" onClick={onClose}>Cancelar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}