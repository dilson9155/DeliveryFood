"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  KeyRound,
  CheckCircle2,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { AvatarUploader } from "@/components/ui/avatar-uploader";
import {
  updateProfileAction,
  changePasswordAction,
} from "@/app/actions/profile";
import { updateMyAvatarAction } from "@/app/actions/avatar";
import { formatTaxId } from "@/lib/format";
import {
  saveAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
} from "@/app/actions/delivery";

type Address = {
  id: string;
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  isDefault: boolean;
};

export function MyDataForm({
  name: initialName,
  phone: initialPhone,
  email: initialEmail,
  taxId: initialTaxId,
  defaultObservation: initialObs,
  addresses: initialAddresses,
  avatarUrl: initialAvatarUrl,
}: {
  name: string;
  phone: string;
  email: string;
  taxId: string;
  defaultObservation: string;
  addresses: Address[];
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const { show } = useToast();

  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);
  const [taxId, setTaxId] = useState(
    initialTaxId ? formatTaxId(initialTaxId) : ""
  );
  const [defaultObservation, setDefaultObservation] = useState(initialObs);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [addresses, setAddresses] = useState<Address[]>(initialAddresses);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addr, setAddr] = useState({
    label: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    zipCode: "",
  });

  const [isPendingProfile, startProfile] = useTransition();
  const [isPendingPwd, startPwd] = useTransition();
  const [isPendingAddr, startAddr] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function saveProfile() {
    startProfile(async () => {
      const res = await updateProfileAction({
        name,
        phone,
        taxId: taxId.replace(/\D/g, "") || null,
        email,
        defaultObservation,
      });
      if (res.ok) show("success", "Dados atualizados.");
      else show("error", res.error);
    });
  }

  function savePassword() {
    startPwd(async () => {
      const res = await changePasswordAction({ currentPassword, newPassword });
      if (res.ok) {
        show("success", "Senha alterada.");
        setCurrentPassword("");
        setNewPassword("");
      } else {
        show("error", res.error);
      }
    });
  }

  function saveAddress() {
    startAddr(async () => {
      const res = await saveAddressAction({
        label: addr.label,
        street: addr.street,
        number: addr.number,
        complement: addr.complement,
        neighborhood: addr.neighborhood,
        city: addr.city,
        state: addr.state,
        zipCode: addr.zipCode,
        makeDefault: addresses.length === 0,
      });
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      show("success", "Endereço salvo.");
      setShowAddressForm(false);
      setAddr({ label: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", zipCode: "" });
      router.refresh();
    });
  }

  function setDefault(id: string) {
    setPendingId(id);
    startAddr(async () => {
      const res = await setDefaultAddressAction(id);
      setPendingId(null);
      if (!res.ok) {
        show("error", res.error ?? "Erro");
        return;
      }
      setAddresses((prev) =>
        prev.map((a) => ({ ...a, isDefault: a.id === id })).sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
      );
      show("success", "Endereço padrão definido.");
    });
  }

  function remove(id: string) {
    if (!confirm("Excluir este endereço?")) return;
    setPendingId(id);
    startAddr(async () => {
      const res = await deleteAddressAction(id);
      setPendingId(null);
      if (!res.ok) {
        show("error", res.error ?? "Erro");
        return;
      }
      setAddresses((prev) => prev.filter((a) => a.id !== id));
      show("success", "Endereço removido.");
    });
  }

  return (
    <div className="container-store py-8">
      <h1 className="mb-5 text-xl font-bold sm:text-2xl">Meus dados</h1>

      <Card className="mb-6 p-6 md:p-7">
        <AvatarUploader
          name={name}
          currentUrl={initialAvatarUrl}
          size="lg"
          label="Sua foto de perfil"
          onChange={async (dataUrl) => {
            const r = await updateMyAvatarAction({ dataUrl });
            return r;
          }}
        />
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6 md:p-7">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Dados do cadastro
          </h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="phone">Telefone (com DDD)</Label>
              <Input
                id="phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="taxId">CPF ou CNPJ</Label>
              <Input
                id="taxId"
                inputMode="numeric"
                autoComplete="off"
                value={taxId}
                onChange={(e) => setTaxId(formatTaxId(e.target.value))}
                placeholder="000.000.000-00"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Necessário para pagar com PIX.
              </p>
            </div>
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="defaultObs">Observação padrão para pedidos</Label>
              <textarea
                id="defaultObs"
                value={defaultObservation}
                onChange={(e) => setDefaultObservation(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Ex.: sem cebola, trocar refrigerante"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <Button size="lg" onClick={saveProfile} disabled={isPendingProfile} className="w-full">
              {isPendingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar dados
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6 md:p-7">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <MapPin className="h-4 w-4 text-brand-600" />
                Endereços de entrega
              </h2>
              <Button size="sm" variant="outline" onClick={() => setShowAddressForm((v) => !v)}>
                <Plus className="h-3.5 w-3.5" />
                Novo
              </Button>
            </div>

            {showAddressForm && (
              <div className="mb-4 space-y-2 rounded-xl border border-border bg-background p-3">
                <Input
                  placeholder="Apelido (ex.: Casa, Trabalho)"
                  value={addr.label}
                  onChange={(e) => setAddr({ ...addr, label: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="CEP"
                    value={addr.zipCode}
                    onChange={(e) => setAddr({ ...addr, zipCode: e.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="Rua"
                    value={addr.street}
                    onChange={(e) => setAddr({ ...addr, street: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="Número"
                    value={addr.number}
                    onChange={(e) => setAddr({ ...addr, number: e.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="Complemento (opcional)"
                    value={addr.complement}
                    onChange={(e) => setAddr({ ...addr, complement: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="Bairro"
                    value={addr.neighborhood}
                    onChange={(e) => setAddr({ ...addr, neighborhood: e.target.value })}
                  />
                  <Input
                    placeholder="Cidade"
                    value={addr.city}
                    onChange={(e) => setAddr({ ...addr, city: e.target.value })}
                  />
                  <Input
                    placeholder="UF"
                    maxLength={2}
                    value={addr.state}
                    onChange={(e) => setAddr({ ...addr, state: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowAddressForm(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={saveAddress}
                    disabled={
                      isPendingAddr ||
                      !addr.street ||
                      !addr.number ||
                      !addr.neighborhood ||
                      !addr.city ||
                      !addr.state ||
                      !addr.zipCode
                    }
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            )}

            {addresses.length === 0 ? (
              <p className="rounded-xl bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
                Você ainda não tem endereços salvos.
              </p>
            ) : (
              <ul className="space-y-2">
                {addresses.map((a) => (
                  <li
                    key={a.id}
                    className={`rounded-xl border p-3 text-sm ${
                      a.isDefault ? "border-brand-600 bg-brand-50" : "border-border bg-background"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium">
                          {a.label && <span className="font-bold">{a.label} ·</span>}
                          {a.street}, {a.number}
                          {a.isDefault && (
                            <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                              Padrão
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.complement ? `${a.complement} · ` : ""}
                          {a.neighborhood} · {a.city}/{a.state} · CEP {a.zipCode}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {!a.isDefault && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isPendingAddr && pendingId === a.id}
                            onClick={() => setDefault(a.id)}
                            title="Tornar padrão"
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isPendingAddr && pendingId === a.id}
                          onClick={() => remove(a.id)}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-6 md:p-7">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
              <KeyRound className="h-4 w-4 text-brand-600" />
              Alterar senha
            </h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="currentPassword">Senha atual</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div>
                <Label htmlFor="newPassword">Nova senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                />
              </div>
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                onClick={savePassword}
                disabled={isPendingPwd}
              >
                {isPendingPwd ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Alterar senha
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}