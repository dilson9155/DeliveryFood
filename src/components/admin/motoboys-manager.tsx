"use client";

import { useState, useTransition } from "react";
import { Plus, Edit2, Power, PowerOff, Bike, Phone, Hash, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";

export type Motoboy = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  login: string | null;
  active: boolean;
  vehiclePlate: string | null;
  vehicleModel: string | null;
  createdAt: string | Date;
  _count: { deliveries: number };
};

export function MotoboysManager({ motoboys }: { motoboys: Motoboy[] }) {
  const { show } = useToast();
  const [list, setList] = useState(motoboys);
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Motoboy | null>(null);
  const [showForm, setShowForm] = useState(false);

  function toggleActive(m: Motoboy) {
    startTransition(async () => {
      const res = await import("@/app/actions/admin").then((mod) =>
        mod.setUserActiveAction({ userId: m.id, active: !m.active })
      );
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      setList((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x))
      );
      show("success", `Motoboy ${m.active ? "desativado" : "ativado"}`);
    });
  }

  function save(m: Motoboy | null, data: {
    name: string;
    phone: string;
    login: string;
    password: string;
    vehiclePlate: string;
    vehicleModel: string;
  }) {
    startTransition(async () => {
      const actions = await import("@/app/actions/admin");
      const res = m
        ? await actions.updateMotoboyAction({ id: m.id, ...data })
        : await actions.createMotoboyAction(data);
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      if (m) {
        setList((prev) =>
          prev.map((x) =>
            x.id === m.id
              ? { ...x, name: data.name, phone: data.phone || null, login: data.login || null, vehiclePlate: data.vehiclePlate || null, vehicleModel: data.vehicleModel || null }
              : x
          )
        );
        show("success", "Motoboy atualizado");
      } else {
        setList((prev) => [...prev, res.motoboy]);
        show("success", "Motoboy criado");
      }
      setShowForm(false);
      setEditing(null);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Bike className="h-6 w-6 text-brand-600" />
            Entregadores
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie motoboys e permissões de acesso ao painel.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Novo motoboy
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum motoboy cadastrado.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => (
            <div
              key={m.id}
              className={`rounded-2xl border bg-card p-4 ${
                m.active ? "border-border" : "border-border/40 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold">{m.name}</p>
                  {m.login && (
                    <p className="text-xs text-muted-foreground">Login: {m.login}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                    m.active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {m.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {m.phone && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3" /> {m.phone}
                  </p>
                )}
                {m.vehiclePlate && (
                  <p className="flex items-center gap-1.5">
                    <Hash className="h-3 w-3" /> {m.vehiclePlate}
                    {m.vehicleModel && <span className="text-muted-foreground">· {m.vehicleModel}</span>}
                  </p>
                )}
                <p className="text-[11px]">
                  {m._count.deliveries} entrega(s) · cadastrado em {formatDateTime(m.createdAt)}
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(m);
                    setShowForm(true);
                  }}
                  disabled={isPending}
                >
                  <Edit2 className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant={m.active ? "danger" : "success"}
                  onClick={() => toggleActive(m)}
                  disabled={isPending}
                >
                  {m.active ? (
                    <>
                      <PowerOff className="h-3.5 w-3.5" /> Desativar
                    </>
                  ) : (
                    <>
                      <Power className="h-3.5 w-3.5" /> Ativar
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <MotoboyForm
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSubmit={(data) => save(editing, data)}
          isPending={isPending}
        />
      )}
    </div>
  );
}

function MotoboyForm({
  initial,
  onClose,
  onSubmit,
  isPending,
}: {
  initial: Motoboy | null;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    phone: string;
    login: string;
    password: string;
    vehiclePlate: string;
    vehicleModel: string;
  }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [login, setLogin] = useState(initial?.login ?? "");
  const [password, setPassword] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState(initial?.vehiclePlate ?? "");
  const [vehicleModel, setVehicleModel] = useState(initial?.vehicleModel ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name, phone, login, password, vehiclePlate, vehicleModel });
        }}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background shadow-2xl animate-fade-in sm:rounded-3xl"
      >
        <div className="border-b border-border p-5">
          <h2 className="text-base font-bold">{initial ? "Editar" : "Novo"} motoboy</h2>
        </div>
        <div className="space-y-3 p-5">
          <Field label="Nome completo" required value={name} onChange={setName} />
          <Field label="Telefone" value={phone} onChange={setPhone} placeholder="(31) 99999-9999" />
          <Field label="Login (para acessar /entregador)" value={login} onChange={setLogin} />
          <Field
            label={initial ? "Nova senha (deixe vazio para manter)" : "Senha"}
            type="password"
            value={password}
            onChange={setPassword}
            required={!initial}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Placa" value={vehiclePlate} onChange={(x) => setVehiclePlate(x.toUpperCase())} placeholder="ABC1D23" />
            <Field label="Modelo" value={vehicleModel} onChange={setVehicleModel} placeholder="Honda CG 160" />
          </div>
        </div>
        <div className="flex gap-2 border-t border-border p-5">
          <Button variant="outline" className="flex-1" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button type="submit" className="flex-1" disabled={isPending || !name || !login || (!initial && !password)}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
        required={required}
      />
    </div>
  );
}