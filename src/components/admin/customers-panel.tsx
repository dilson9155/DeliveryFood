"use client";

import { useMemo, useState } from "react";
import { Search, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty";
import { formatDate, formatPhone } from "@/lib/format";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  createdAt: string;
  _count: { orders: number };
};

export function CustomersPanel({ customers: initial }: { customers: Customer[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      initial.filter((c) => {
        const q = query.toLowerCase();
        return (
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? "").includes(q) ||
          (c.email ?? "").toLowerCase().includes(q)
        );
      }),
    [initial, query]
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          {initial.length} cliente(s) cadastrado(s).
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
          {filtered.map((c) => (
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}