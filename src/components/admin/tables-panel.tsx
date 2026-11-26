"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  CircleSlash,
  LayoutGrid,
  Pencil,
  Plus,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { saveTableAction, setTableActiveAction } from "@/app/actions/tables";
import { cn } from "@/lib/format";

export type TableView = {
  id: string;
  number: number;
  label: string | null;
  seats: number;
  area: string | null;
  notes: string | null;
  active: boolean;
  openComanda: { id: string; number: number } | null;
};

type FormState = {
  id?: string;
  number: string;
  label: string;
  seats: string;
  area: string;
  notes: string;
  active: boolean;
};

const emptyForm: FormState = {
  number: "",
  label: "",
  seats: "4",
  area: "Salão",
  notes: "",
  active: true,
};

export function TablesPanel({ tables: initial }: { tables: TableView[] }) {
  const { show } = useToast();
  const [tables, setTables] = useState(initial);
  const [form, setForm] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();

  function openNew() {
    const next = Math.max(0, ...tables.map((t) => t.number)) + 1;
    setForm({ ...emptyForm, number: String(next) });
  }

  function openEdit(table: TableView) {
    setForm({
      id: table.id,
      number: String(table.number),
      label: table.label ?? "",
      seats: String(table.seats),
      area: table.area ?? "",
      notes: table.notes ?? "",
      active: table.active,
    });
  }

  function save() {
    if (!form) return;
    startTransition(async () => {
      const result = await saveTableAction({
        ...(form.id ? { id: form.id } : {}),
        number: Number(form.number),
        label: form.label || null,
        seats: Number(form.seats) || 2,
        area: form.area || null,
        notes: form.notes || null,
        active: form.active,
      });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      const saved = {
        id: result.id,
        number: Number(form.number),
        label: form.label || null,
        seats: Number(form.seats) || 2,
        area: form.area || null,
        notes: form.notes || null,
        active: form.active,
        openComanda: tables.find((t) => t.id === result.id)?.openComanda ?? null,
      };
      setTables((prev) =>
        prev.some((t) => t.id === result.id)
          ? prev.map((t) => (t.id === result.id ? saved : t))
          : [...prev, saved].sort((a, b) => a.number - b.number)
      );
      setForm(null);
      show("success", `Mesa ${saved.number} salva.`);
    });
  }

  function toggle(table: TableView) {
    startTransition(async () => {
      const result = await setTableActiveAction(table.id, !table.active);
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      setTables((prev) =>
        prev.map((t) => (t.id === table.id ? { ...t, active: !t.active } : t))
      );
      show("success", `Mesa ${table.number} ${table.active ? "desativada" : "ativada"}.`);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <LayoutGrid className="h-6 w-6 text-brand-600" /> Mesas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre as mesas do salão e acompanhe quais estão ocupadas.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/comandas"
            className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            Ver comandas
          </Link>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> Nova mesa
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {tables.map((table) => (
          <Card
            key={table.id}
            className={cn(
              "transition-colors",
              !table.active && "opacity-60",
              table.openComanda && "border-brand-300 bg-brand-50/40"
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {table.area || "Salão"} · {table.seats} lugares
                  </p>
                  <p className="text-lg font-extrabold">{table.label || `Mesa ${table.number}`}</p>
                  <p className="text-xs text-muted-foreground">Nº {table.number}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    !table.active
                      ? "bg-muted text-muted-foreground"
                      : table.openComanda
                        ? "bg-brand-600 text-white"
                        : "bg-success/15 text-success"
                  )}
                >
                  {!table.active
                    ? "Inativa"
                    : table.openComanda
                      ? `Comanda #${table.openComanda.number}`
                      : "Livre"}
                </span>
              </div>
              {table.notes && (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{table.notes}</p>
              )}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(table)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(table)} disabled={pending}>
                  {table.active ? (
                    <><CircleSlash className="h-3.5 w-3.5" /> Desativar</>
                  ) : (
                    <><Check className="h-3.5 w-3.5" /> Ativar</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {tables.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-semibold">Nenhuma mesa cadastrada</p>
            <p className="mt-1 text-sm text-muted-foreground">Clique em “Nova mesa” para começar.</p>
          </div>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-bold">{form.id ? "Editar mesa" : "Nova mesa"}</h2>
              <button
                type="button"
                onClick={() => setForm(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="table-number">Número</Label>
                  <Input
                    id="table-number"
                    type="number"
                    min={1}
                    value={form.number}
                    onChange={(e) => setForm({ ...form, number: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="table-seats">Lugares</Label>
                  <Input
                    id="table-seats"
                    type="number"
                    min={1}
                    value={form.seats}
                    onChange={(e) => setForm({ ...form, seats: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="table-label">Nome (opcional)</Label>
                  <Input
                    id="table-label"
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="Mesa 01, Balcão..."
                  />
                </div>
                <div>
                  <Label htmlFor="table-area">Área</Label>
                  <Input
                    id="table-area"
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                    placeholder="Salão, Varanda..."
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="table-notes">Observação (opcional)</Label>
                <Textarea
                  id="table-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  maxLength={200}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border p-3">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 accent-[#FF9800]"
                />
                <span className="text-sm font-medium">Mesa ativa</span>
              </label>
              <Button className="w-full" size="lg" onClick={save} disabled={pending}>
                {pending ? "Salvando..." : "Salvar mesa"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
