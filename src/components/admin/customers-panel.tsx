"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, User, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { AlertBannerProvider, useAlertBanner } from "@/components/ui/alert-banner";
import { EmptyState } from "@/components/ui/empty";
import { formatDate, formatPhone, cn } from "@/lib/format";
import { deleteCustomerAction } from "@/app/actions/admin";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  createdAt: string;
  _count: { orders: number };
};

export function CustomersPanel({ customers }: { customers: Customer[] }) {
  return (
    <AlertBannerProvider>
      <CustomersPanelInner customers={customers} />
    </AlertBannerProvider>
  );
}

function CustomersPanelInner({ customers: initial }: { customers: Customer[] }) {
  const banner = useAlertBanner();
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const [delConfirmPhone, setDelConfirmPhone] = useState("");
  const [deleting, startDeleting] = useTransition();

  const filtered = useMemo(
    () =>
      items.filter((c) => {
        const q = query.toLowerCase();
        return (
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? "").includes(q) ||
          (c.email ?? "").toLowerCase().includes(q)
        );
      }),
    [items, query]
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          {items.length} cliente(s) cadastrado(s).
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, telefone ou e-mail..."
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<User className="h-8 w-8" />}
          title="Nenhum cliente encontrado"
          description="Nenhum cliente corresponde à sua busca."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const canDelete = c._count.orders === 0;
            return (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-800">
                        {c.name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <p className="truncate text-sm font-bold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.phone ? formatPhone(c.phone) : "Sem telefone"}
                        </p>
                      </div>
                    </div>
                    <Badge tone="default">{c._count.orders} pedidos</Badge>
                  </div>
                  {c.email && <p className="mt-2 truncate text-xs text-muted-foreground">{c.email}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cadastrado em {formatDate(c.createdAt)}
                  </p>
                  <div className="mt-3 flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title={canDelete ? "Excluir cliente" : "Cliente possui pedidos — não pode ser excluído"}
                      onClick={() => {
                        if (!canDelete) {
                          banner.show({
                            type: "warning",
                            title: "Exclusão bloqueada",
                            message: `${c.name} possui ${c._count.orders} pedido(s). Exclua os pedidos (ou use a limpeza de dados de teste) antes de remover o cadastro.`,
                            duration: 7000,
                          });
                          return;
                        }
                        setConfirmDelete(c);
                        setDelConfirmPhone("");
                      }}
                    >
                      <Trash2 className={cn("h-4 w-4", canDelete ? "text-danger" : "text-muted-foreground")} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background shadow-2xl animate-fade-in sm:rounded-3xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-background px-5 py-4">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-danger" /> Excluir cliente
              </h2>
              <button onClick={() => setConfirmDelete(null)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-muted-foreground">
                Esta ação é <strong className="text-danger">irreversível</strong>. Será removido:
              </p>
              <ul className="space-y-1 rounded-xl border border-border bg-muted/40 p-3 text-sm">
                <li><strong>{confirmDelete.name}</strong></li>
                <li className="text-muted-foreground">
                  {confirmDelete.phone ? formatPhone(confirmDelete.phone) : "—"} · {confirmDelete.email ?? "sem e-mail"}
                </li>
              </ul>
              <div>
                <Label htmlFor="del-cust-confirm">
                  Digite o telefone do cliente (somente números) para confirmar
                </Label>
                <Input
                  id="del-cust-confirm"
                  value={delConfirmPhone}
                  onChange={(e) => setDelConfirmPhone(e.target.value)}
                  inputMode="numeric"
                  placeholder="31988888888"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  size="lg"
                  variant="danger"
                  disabled={
                    deleting ||
                    !confirmDelete.phone ||
                    delConfirmPhone.replace(/\D/g, "") !==
                      (confirmDelete.phone ?? "").replace(/\D/g, "")
                  }
                  onClick={() => {
                    const target = confirmDelete;
                    startDeleting(async () => {
                      const res = await deleteCustomerAction({
                        id: target.id,
                        confirmPhone: delConfirmPhone,
                      });
                      if (res.ok) {
                        banner.show({
                          type: "success",
                          title: "Cliente excluído",
                          message: `${target.name} foi removido do sistema.`,
                          details: [
                            { label: "Endereços removidos", value: res.addressesRemoved ?? 0 },
                          ],
                          duration: 0,
                        });
                        setItems((prev) => prev.filter((x) => x.id !== target.id));
                        setConfirmDelete(null);
                        setDelConfirmPhone("");
                      } else {
                        banner.show({
                          type: "error",
                          title: "Não foi possível excluir",
                          message: res.error,
                          duration: 7000,
                        });
                      }
                    });
                  }}
                >
                  {deleting ? "Excluindo..." : "Excluir definitivamente"}
                </Button>
                <Button size="lg" variant="ghost" onClick={() => setConfirmDelete(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
