"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Pencil, Power, PowerOff, X, Search, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Label } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty";
import { saveEmployeeAction, toggleEmployeeActiveAction } from "@/app/actions/admin";
import { ROLE_LABELS } from "@/lib/permissions";
import type { EmployeeRole } from "@prisma/client";

type Employee = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  login: string;
  role: EmployeeRole;
  active: boolean;
  lastLogin: string | null;
  createdAt: string;
};

const ROLES: EmployeeRole[] = ["ADMIN", "MANAGER", "ATTENDANT", "KITCHEN", "CASHIER"];

export function EmployeesPanel({
  employees: initial,
  currentUserId,
}: {
  employees: Employee[];
  currentUserId?: string;
}) {
  const { show } = useToast();
  const [, startTransition] = useTransition();
  const [employees, setEmployees] = useState(initial);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(
    () => employees.filter((e) => !query || e.name.toLowerCase().includes(query.toLowerCase()) || e.login.toLowerCase().includes(query.toLowerCase())),
    [employees, query]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Colaboradores</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie acessos, funções e permissões da equipe.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setCreating(true); }}>
          <Plus className="h-4 w-4" /> Novo colaborador
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou login..."
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="Nenhum colaborador encontrado"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => (
            <Card key={e.id} className={!e.active ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-lg font-bold text-brand-800">
                      {e.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="truncate text-sm font-bold">{e.name}</p>
                      <p className="text-xs text-muted-foreground">@{e.login}</p>
                    </div>
                  </div>
                  <Badge tone={e.active ? "success" : "muted"}>{e.active ? "Ativo" : "Inativo"}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Shield className="h-3.5 w-3.5" /> {ROLE_LABELS[e.role]}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.phone ?? "Sem telefone"}
                </p>
                <div className="mt-3 flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(e); setCreating(false); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {e.id !== currentUserId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        startTransition(async () => {
                          const res = await toggleEmployeeActiveAction(e.id, !e.active);
                          if (res.ok) {
                            show("success", "Colaborador " + (e.active ? "desativado" : "ativado"));
                            setEmployees((prev) => prev.map((x) => (x.id === e.id ? { ...x, active: !e.active } : x)));
                          } else show("error", res.error);
                        })
                      }
                    >
                      {e.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <EmployeeForm
          employee={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function EmployeeForm({
  employee,
  onClose,
}: {
  employee: Employee | null;
  onClose: () => void;
}) {
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: employee?.name ?? "",
    phone: employee?.phone ?? "",
    email: employee?.email ?? "",
    login: employee?.login ?? "",
    password: "",
    role: (employee?.role ?? "ATTENDANT") as EmployeeRole,
    active: employee?.active ?? true,
  });

  function submit() {
    startTransition(async () => {
      const res = await saveEmployeeAction({
        id: employee?.id,
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        login: form.login,
        password: form.password,
        role: form.role,
        active: form.active,
      });
      if (res.ok) {
        show("success", employee ? "Colaborador atualizado." : "Colaborador criado.");
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
          <h2 className="text-base font-bold">{employee ? "Editar colaborador" : "Novo colaborador"}</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <Label htmlFor="emp-name">Nome</Label>
            <Input id="emp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="emp-phone">Telefone (opcional)</Label>
            <Input id="emp-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="emp-email">E-mail (opcional)</Label>
            <Input id="emp-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="emp-login">Login</Label>
            <Input id="emp-login" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="emp-password">
              Senha {employee ? "(deixe em branco para manter)" : ""}
            </Label>
            <Input id="emp-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!employee} minLength={6} />
          </div>
          <div>
            <Label htmlFor="emp-role">Função</Label>
            <Select id="emp-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as EmployeeRole })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Status</span>
            <Button size="sm" variant={form.active ? "success" : "secondary"} onClick={() => setForm({ ...form, active: !form.active })}>
              {form.active ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
              {form.active ? "Ativo" : "Inativo"}
            </Button>
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" size="lg" disabled={isPending || !form.name || !form.login} onClick={submit}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button size="lg" variant="ghost" onClick={onClose}>Cancelar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}