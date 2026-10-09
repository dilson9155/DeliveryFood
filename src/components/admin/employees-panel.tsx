"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Pencil, Power, PowerOff, X, Search, Shield, Trash2, Camera } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Label } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { AlertBannerProvider, useAlertBanner } from "@/components/ui/alert-banner";
import { EmptyState } from "@/components/ui/empty";
import { AvatarUploader } from "@/components/ui/avatar-uploader";
import { Avatar } from "@/components/ui/avatar";
import { saveEmployeeAction, toggleEmployeeActiveAction, deleteEmployeeAction } from "@/app/actions/admin";
import { updateUserAvatarAction } from "@/app/actions/avatar";
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
  avatarUrl: string | null;
};

const ROLES: EmployeeRole[] = ["ADMIN", "MANAGER", "ATTENDANT", "KITCHEN", "CASHIER"];

export function EmployeesPanel({
  employees,
  currentUserId,
}: {
  employees: Employee[];
  currentUserId?: string;
}) {
  return (
    <AlertBannerProvider>
      <EmployeesPanelInner employees={employees} currentUserId={currentUserId} />
    </AlertBannerProvider>
  );
}

function EmployeesPanelInner({
  employees: initial,
  currentUserId,
}: {
  employees: Employee[];
  currentUserId?: string;
}) {
  const { show } = useToast();
  const banner = useAlertBanner();
  const [, startTransition] = useTransition();
  const [employees, setEmployees] = useState(initial);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, startDeleting] = useTransition();

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
                    <Avatar name={e.name} src={e.avatarUrl} size="md" />
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
                  {e.id !== currentUserId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setConfirmDelete(e); setDeleteConfirmText(""); }}
                      title="Excluir colaborador"
                    >
                      <Trash2 className="h-4 w-4 text-danger" />
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
          setEmployees={setEmployees}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background shadow-2xl animate-fade-in sm:rounded-3xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-background px-5 py-4">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-danger" /> Excluir colaborador
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
                <li className="text-muted-foreground">@{confirmDelete.login} · {ROLE_LABELS[confirmDelete.role]}</li>
              </ul>
              <div>
                <Label htmlFor="del-emp-confirm">
                  Digite <strong>@{confirmDelete.login}</strong> para confirmar
                </Label>
                <Input
                  id="del-emp-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={`@${confirmDelete.login}`}
                  autoFocus
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  size="lg"
                  variant="danger"
                  disabled={deleting || deleteConfirmText.trim().toLowerCase() !== (confirmDelete.login ?? "").toLowerCase()}
                  onClick={() => {
                    const target = confirmDelete;
                    startDeleting(async () => {
                      const res = await deleteEmployeeAction({
                        id: target.id,
                        confirmLogin: deleteConfirmText,
                      });
                      if (res.ok) {
                        banner.show({
                          type: "success",
                          title: "Colaborador excluído",
                          message: `${target.name} foi removido do sistema.`,
                          details: [
                            { label: "Pedidos vinculados", value: res.orders ?? 0 },
                            { label: "Entregas vinculadas", value: res.deliveries ?? 0 },
                          ],
                          duration: 0,
                        });
                        setEmployees((prev) => prev.filter((x) => x.id !== target.id));
                        setConfirmDelete(null);
                        setDeleteConfirmText("");
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

function EmployeeForm({
  employee,
  onClose,
  setEmployees,
}: {
  employee: Employee | null;
  onClose: () => void;
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
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
          {employee && (
            <AvatarUploader
              name={form.name || employee.name}
              currentUrl={employee.avatarUrl ?? null}
              onChange={async (dataUrl) => {
                const r = await updateUserAvatarAction({ userId: employee.id, dataUrl });
                if (r.ok) {
                  // reflete o avatar no card sem esperar revalidate
                  setEmployees((prev) =>
                    prev.map((x) =>
                      x.id === employee.id ? { ...x, avatarUrl: r.avatarUrl ?? null } : x
                    )
                  );
                }
                return r;
              }}
              size="lg"
              label="Foto do colaborador"
            />
          )}
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