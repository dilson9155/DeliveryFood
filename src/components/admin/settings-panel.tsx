"use client";

import { useState, useTransition } from "react";
import { Save, Store, Clock, Power, MoveRight, Upload, Trash2, Printer } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import {
  saveSettingsAction,
  saveBusinessHoursAction,
  toggleOpenOverrideAction,
} from "@/app/actions/admin";
import { TEMPLATES, DEFAULT_TEMPLATE_ID } from "@/lib/print-templates";

const DAYS = [
  { n: 0, label: "Domingo", short: "Dom" },
  { n: 1, label: "Segunda-feira", short: "Seg" },
  { n: 2, label: "Terça-feira", short: "Ter" },
  { n: 3, label: "Quarta-feira", short: "Qua" },
  { n: 4, label: "Quinta-feira", short: "Qui" },
  { n: 5, label: "Sexta-feira", short: "Sex" },
  { n: 6, label: "Sábado", short: "Sáb" },
];

type SettingsData = {
  storeName: string;
  logoUrl: string | null;
  cnpj: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  prepTimeMinutes: number;
  isManuallyOpen: boolean | null;
  receiptMessage: string | null;
  receiptFooter: string | null;
  printTemplateId: string | null;
};

type HourRow = {
  dayOfWeek: number;
  open: boolean;
  openTime: string;
  closeTime: string;
};

export function SettingsPanel({
  settings: initial,
  hours: initialHours,
}: {
  settings: SettingsData | null;
  hours: HourRow[];
}) {
  const { show } = useToast();
  const [, startTransition] = useTransition();

  const [form, setForm] = useState({
    storeName: initial?.storeName ?? "Meu Estabelecimento",
    phone: initial?.phone ?? "",
    whatsapp: initial?.whatsapp ?? "",
    email: initial?.email ?? "",
    cnpj: initial?.cnpj ?? "",
    address: initial?.address ?? "",
    number: initial?.number ?? "",
    complement: initial?.complement ?? "",
    neighborhood: initial?.neighborhood ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    zipCode: initial?.zipCode ?? "",
    logoUrl: initial?.logoUrl ?? "",
    prepTimeMinutes: initial?.prepTimeMinutes ?? 30,
    receiptMessage: initial?.receiptMessage ?? "",
    receiptFooter: initial?.receiptFooter ?? "",
    printTemplateId: initial?.printTemplateId ?? DEFAULT_TEMPLATE_ID,
  });

  const [hours, setHours] = useState<HourRow[]>(
    DAYS.map((d) => {
      const existing = initialHours.find((h) => h.dayOfWeek === d.n);
      return (
        existing ?? {
          dayOfWeek: d.n,
          open: true,
          openTime: "10:00",
          closeTime: "22:00",
        }
      );
    })
  );

  const [override, setOverride] = useState<"schedule" | "open" | "closed">(
    initial?.isManuallyOpen == null
      ? "schedule"
      : initial.isManuallyOpen
        ? "open"
        : "closed"
  );

  function set(k: string, v: string | number) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function setHour(n: number, patch: Partial<HourRow>) {
    setHours((hs) => hs.map((h) => (h.dayOfWeek === n ? { ...h, ...patch } : h)));
  }

  function handleLogoFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      show("error", "O arquivo enviado não é uma imagem.");
      return;
    }
    if (file.size > 512 * 1024) {
      show("error", "A imagem deve ter no máximo 512 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("logoUrl", String(reader.result ?? ""));
    reader.onerror = () => show("error", "Não foi possível ler a imagem.");
    reader.readAsDataURL(file);
  }

  function saveStore() {
    startTransition(async () => {
      const res = await saveSettingsAction({
        ...form,
        prepTimeMinutes: Number(form.prepTimeMinutes) || 30,
        printTemplateId: form.printTemplateId,
        receiptMessage: form.receiptMessage || null,
        receiptFooter: form.receiptFooter || null,
      });
      if (res.ok) show("success", "Configurações salvas.");
      else show("error", res.error);
    });
  }

  function saveHours() {
    startTransition(async () => {
      const res = await saveBusinessHoursAction(hours);
      if (res.ok) show("success", "Horários salvos.");
      else show("error", res.error);
    });
  }

  function saveOverride() {
    startTransition(async () => {
      const value = override === "schedule" ? null : override === "open";
      const res = await toggleOpenOverrideAction(value);
      if (res.ok) show("success", "Estado do estabelecimento atualizado.");
      else show("error", res.error);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Dados do estabelecimento, horários e abertura.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Dados do estabelecimento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="storeName">Nome do estabelecimento</Label>
            <Input id="storeName" value={form.storeName} onChange={(e) => set("storeName", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="logo-file">Logo</Label>
            <div className="flex items-center gap-3">
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border ${form.logoUrl ? "" : "bg-muted"}`}>
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logoUrl} alt="Logo" className="h-full w-full object-cover" />
                ) : (
                  <Store className="h-6 w-6 text-muted-foreground" />
                )}
              </span>
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <label
                    htmlFor="logo-file"
                    className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:border-brand-300"
                  >
                    <Upload className="h-4 w-4" /> Escolher imagem
                  </label>
                  <input
                    id="logo-file"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleLogoFile(e.target.files?.[0] ?? null)}
                  />
                  {form.logoUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => set("logoUrl", "")}>
                      <Trash2 className="h-4 w-4" /> Remover
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">PNG ou JPG, no máximo 512 KB.</p>
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input id="cnpj" value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input id="whatsapp" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="address">Rua / Avenida</Label>
            <Input id="address" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="number">Número</Label>
            <Input id="number" value={form.number} onChange={(e) => set("number", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="complement">Complemento</Label>
            <Input id="complement" value={form.complement} onChange={(e) => set("complement", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="neighborhood">Bairro</Label>
            <Input id="neighborhood" value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="city">Cidade</Label>
            <Input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="state">UF</Label>
            <Input id="state" value={form.state} onChange={(e) => set("state", e.target.value)} maxLength={2} placeholder="MG" />
          </div>
          <div>
            <Label htmlFor="zipCode">CEP</Label>
            <Input id="zipCode" value={form.zipCode} onChange={(e) => set("zipCode", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="prepTime">Tempo de preparo (min)</Label>
            <Input id="prepTime" type="number" min={1} max={600} value={form.prepTimeMinutes} onChange={(e) => set("prepTimeMinutes", Number(e.target.value))} />
          </div>
        </CardContent>
        <CardContent className="border-t border-border">
          <Button onClick={saveStore} size="lg">
            <Save className="h-4 w-4" /> Salvar dados
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Horário de funcionamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {hours.map((h) => {
            const day = DAYS.find((d) => d.n === h.dayOfWeek)!;
            return (
              <div key={h.dayOfWeek} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 sm:flex-nowrap">
                <label className="flex min-w-[8.5rem] items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={h.open}
                    onChange={(e) => setHour(h.dayOfWeek, { open: e.target.checked })}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {h.open ? day.label : <span className="text-muted-foreground line-through">{day.label}</span>}
                </label>
                {h.open ? (
                  <>
                    <Input
                      type="time"
                      value={h.openTime}
                      onChange={(e) => setHour(h.dayOfWeek, { openTime: e.target.value })}
                      className="h-9 w-32"
                    />
                    <MoveRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Input
                      type="time"
                      value={h.closeTime}
                      onChange={(e) => setHour(h.dayOfWeek, { closeTime: e.target.value })}
                      className="h-9 w-32"
                    />
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">Fechado</span>
                )}
              </div>
            );
          })}
        </CardContent>
        <CardContent className="border-t border-border">
          <Button onClick={saveHours} size="lg" variant="outline">
            <Save className="h-4 w-4" /> Salvar horários
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Power className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Abertura</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="override">Estado atual do estabelecimento</Label>
            <div className="flex gap-2">
              {(
                [
                  ["schedule", "Seguir horário"],
                  ["open", "Forçar aberto"],
                  ["closed", "Forçar fechado"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOverride(value)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                    override === value
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-border bg-card text-muted-foreground hover:border-brand-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={saveOverride} size="lg" variant="outline">
            <Save className="h-4 w-4" /> Aplicar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Printer className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Impressão de recibos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="printTemplateId">Modelo de impressora</Label>
            <select
              id="printTemplateId"
              value={form.printTemplateId}
              onChange={(e) => set("printTemplateId", e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              {Object.values(TEMPLATES).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {TEMPLATES[form.printTemplateId]?.description}
            </p>
          </div>

          <div>
            <Label htmlFor="receiptMessage">Mensagem interna do recibo</Label>
            <textarea
              id="receiptMessage"
              rows={2}
              value={form.receiptMessage}
              onChange={(e) => set("receiptMessage", e.target.value)}
              placeholder="Ex.: Pedido preparado com carinho"
              maxLength={300}
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Aparece no centro do recibo, antes do rodapé.
            </p>
          </div>

          <div>
            <Label htmlFor="receiptFooter">Rodapé do recibo</Label>
            <input
              id="receiptFooter"
              type="text"
              value={form.receiptFooter}
              onChange={(e) => set("receiptFooter", e.target.value)}
              placeholder="Ex.: Obrigado pela preferência! Volte sempre 🥰"
              maxLength={300}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          <a
            href="/recibo/novo-recibo-demo"
            className="inline-block text-xs text-brand-600 hover:underline"
            onClick={(e) => {
              e.preventDefault();
              alert(
                "Para testar a impressão:\n\n1. Crie um pedido no sistema\n2. Abra o recibo\n3. Selecione o modelo\n4. Clique em Imprimir ou PDF"
              );
            }}
          >
            Como testar?
          </a>
        </CardContent>
        <CardContent className="border-t border-border">
          <Button onClick={saveStore} size="lg">
            <Save className="h-4 w-4" /> Salvar impressão
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}