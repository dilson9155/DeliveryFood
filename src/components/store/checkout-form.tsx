"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Bike,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  MessageSquareText,
  Phone,
  QrCode,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useCart, cartSubtotal } from "@/stores/cart";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { formatCurrency } from "@/lib/format";
import { cartItemKey, describeOptions, type OptionSelection } from "@/lib/product-options";
import { createOrderAction } from "@/app/actions/orders";
import type { PaymentMethod } from "@prisma/client";

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; note: string; icon: React.ReactNode }[] = [
  { value: "PIX", label: "PIX", note: "QR Code estático", icon: <QrCode className="h-5 w-5" /> },
  { value: "CASH", label: "Dinheiro", note: "Pague ao receber", icon: <Banknote className="h-5 w-5" /> },
  { value: "CARD", label: "Cartão", note: "Débito ou crédito", icon: <CreditCard className="h-5 w-5" /> },
];

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

type CheckoutProps = {
  customer: {
    name: string;
    phone: string | null;
    defaultObservation: string | null;
  };
  open: boolean;
  statusMessage: string;
  settings: {
    storeName: string;
    address: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    phone: string | null;
    prepTimeMinutes: number | null;
    deliveryEnabled: boolean;
    deliveryFee: number;
  };
  hours: { dayOfWeek: number; open: boolean; openTime: string; closeTime: string }[];
  savedAddresses: Address[];
};

const fieldClass =
  "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40";

export function CheckoutForm({
  customer,
  open,
  statusMessage,
  settings,
  hours,
  savedAddresses,
}: CheckoutProps) {
  const router = useRouter();
  const { items, clear } = useCart();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();

  const defaultAddress = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0] ?? null;
  const [mode, setMode] = useState<"PICKUP" | "DELIVERY">(
    settings.deliveryEnabled ? "DELIVERY" : "PICKUP"
  );
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [observation, setObservation] = useState(customer.defaultObservation ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [address, setAddress] = useState({
    street: defaultAddress?.street ?? "",
    number: defaultAddress?.number ?? "",
    complement: defaultAddress?.complement ?? "",
    neighborhood: defaultAddress?.neighborhood ?? "",
    city: defaultAddress?.city ?? "",
    state: defaultAddress?.state ?? "",
    zipCode: defaultAddress?.zipCode ?? "",
  });

  const subtotal = cartSubtotal(items);
  const deliveryFee = mode === "DELIVERY" ? settings.deliveryFee : 0;
  const total = useMemo(() => subtotal + deliveryFee, [subtotal, deliveryFee]);

  function submit() {
    if (items.length === 0) {
      show("error", "Seu carrinho está vazio.");
      return;
    }
    if (name.trim().length < 2) {
      show("error", "Informe seu nome para identificar o pedido.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      show("error", "Informe um telefone com DDD.");
      return;
    }
    if (mode === "DELIVERY") {
      if (!address.street.trim() || !address.number.trim() || !address.neighborhood.trim() || !address.city.trim()) {
        show("error", "Preencha rua, número, bairro e cidade para a entrega.");
        return;
      }
    }

    const recipientAddress =
      mode === "DELIVERY"
        ? `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ""} — ${address.neighborhood}, ${address.city}/${address.state} — CEP ${address.zipCode}`.slice(0, 300)
        : null;

    startTransition(async () => {
      const result = await createOrderAction({
        items: items
          .filter((item) => !item.special)
          .map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            options: (item.options ?? []).map(
              ({ groupId, optionId, quantity }): OptionSelection => ({
                groupId,
                optionId,
                quantity,
              })
            ),
          })),
        specialItems: items
          .filter((item) => item.special?.kind === "DAILY")
          .map((item) => ({
            mealId: item.special!.mealId,
            sizeId: item.special!.sizeId,
            quantity: item.quantity,
          })),
        paymentMethod,
        observation: observation.trim() || null,
        recipientName: name.trim(),
        recipientPhone: phone.replace(/\D/g, ""),
        recipientAddress,
        delivery: {
          mode,
          ...(mode === "DELIVERY" ? { address: { ...address, complement: address.complement || null } } : {}),
        },
      });

      if (!result.ok) {
        show("error", result.error);
        return;
      }
      clear();
      show("success", `Pedido #${result.number} realizado!`);
      router.push(`/pedido/${result.orderId}`);
    });
  }

  if (items.length === 0) {
    return (
      <div className="container-store py-10">
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" />}
          title="Seu carrinho está vazio"
          description="Adicione produtos antes de finalizar o pedido."
          action={<Link href="/"><Button variant="outline">Ver produtos</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="container-store py-6">
      <h1 className="mb-1 text-xl font-bold sm:text-2xl">Finalizar pedido</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Confira seus dados, escolha como receber e envie em uma única etapa.
      </p>

      {!open && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {statusMessage}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {settings.deliveryEnabled && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-bold">Como você quer receber?</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMode("DELIVERY")}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    mode === "DELIVERY"
                      ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                      : "border-border bg-background hover:bg-muted/50"
                  }`}
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${mode === "DELIVERY" ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground"}`}>
                    <Bike className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">Entrega</span>
                    <span className="block text-xs text-muted-foreground">
                      Taxa fixa de {formatCurrency(settings.deliveryFee)}
                    </span>
                  </span>
                  {mode === "DELIVERY" && <CheckCircle2 className="h-5 w-5 text-brand-600" />}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("PICKUP")}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    mode === "PICKUP"
                      ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                      : "border-border bg-background hover:bg-muted/50"
                  }`}
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${mode === "PICKUP" ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground"}`}>
                    <UtensilsCrossed className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">Retirada</span>
                    <span className="block text-xs text-muted-foreground">Buscar na loja, sem taxa</span>
                  </span>
                  {mode === "PICKUP" && <CheckCircle2 className="h-5 w-5 text-brand-600" />}
                </button>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-bold">Seus dados</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Nome</label>
                <input
                  className={fieldClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome para identificar o pedido"
                  maxLength={120}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Telefone com DDD</label>
                <input
                  className={fieldClass}
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="31999999999"
                  maxLength={15}
                />
              </div>
            </div>

            {mode === "DELIVERY" && (
              <div className="mt-4 border-t border-border pt-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <MapPin className="h-4 w-4 text-brand-600" /> Endereço para entrega
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-muted-foreground">Rua / Avenida</label>
                    <input className={fieldClass} value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Número</label>
                    <input className={fieldClass} value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-xs text-muted-foreground">Complemento (opcional)</label>
                    <input className={fieldClass} value={address.complement} onChange={(e) => setAddress({ ...address, complement: e.target.value })} placeholder="Apto, bloco, referência..." />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Bairro</label>
                    <input className={fieldClass} value={address.neighborhood} onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Cidade</label>
                    <input className={fieldClass} value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">UF</label>
                    <input className={fieldClass} maxLength={2} value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-xs text-muted-foreground">CEP</label>
                    <input className={fieldClass} inputMode="numeric" value={address.zipCode} onChange={(e) => setAddress({ ...address, zipCode: e.target.value })} placeholder="00000-000" />
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 border-t border-border pt-4">
              <label className="mb-1 flex items-center gap-2 text-sm font-bold">
                <MessageSquareText className="h-4 w-4 text-muted-foreground" /> Observação (opcional)
              </label>
              <textarea
                className={fieldClass}
                rows={3}
                maxLength={500}
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Ex.: sem cebola, ponto da carne..."
              />
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-bold">Forma de pagamento</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {PAYMENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPaymentMethod(option.value)}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                    paymentMethod === option.value
                      ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                      : "border-border bg-background hover:bg-muted/50"
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${paymentMethod === option.value ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground"}`}>
                    {option.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{option.note}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
              <MapPin className="h-4 w-4 text-brand-600" />
              {mode === "DELIVERY" ? "Entrega" : "Retirada no estabelecimento"}
            </h2>
            <p className="text-sm font-medium">{settings.storeName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {settings.address}{settings.number ? `, ${settings.number}` : ""}
              {settings.complement ? ` - ${settings.complement}` : ""}
              {settings.neighborhood ? `, ${settings.neighborhood}` : ""}
              {settings.city ? ` — ${settings.city}` : ""}
              {settings.state ? `/${settings.state}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {settings.phone && (
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {settings.phone}</span>
              )}
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Preparo: {settings.prepTimeMinutes ?? 30} min</span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {hours.filter((h) => h.open).map((h) => (
                <li key={h.dayOfWeek}>
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][h.dayOfWeek]}: {h.openTime} às {h.closeTime}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="h-fit lg:sticky lg:top-20">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold">Resumo do pedido</h2>
            <ul className="mb-4 space-y-2.5">
              {items.map((item) => (
                <li key={cartItemKey(item.productId, item.options)} className="flex items-start justify-between gap-2 text-sm">
                  <span className="flex-1">
                    <span className="font-medium text-foreground">
                      {item.special?.kind === "DAILY" && (
                        <span className="mr-1 rounded bg-brand-50 px-1 py-0.5 text-[9px] font-bold uppercase text-brand-700">
                          Marmita
                        </span>
                      )}
                      {item.quantity}× {item.name}
                    </span>
                    {item.options && item.options.length > 0 && (
                      <span className="mt-0.5 block text-xs text-brand-700">{describeOptions(item.options)}</span>
                    )}
                    <span className="block text-xs text-muted-foreground">{formatCurrency(item.unitPrice)} cada</span>
                  </span>
                  <span className="font-semibold">{formatCurrency(item.unitPrice * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {mode === "DELIVERY" && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Taxa de entrega</span>
                  <span>{formatCurrency(deliveryFee)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <span className="text-muted-foreground">Total</span>
                <span className="text-xl font-extrabold text-brand-700">{formatCurrency(total)}</span>
              </div>
            </div>
            <Button className="mt-4 w-full" size="lg" disabled={!open || isPending} onClick={submit}>
              {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <UtensilsCrossed className="h-4 w-4" />}
              {isPending ? "Enviando pedido..." : "Confirmar pedido"}
            </Button>
            <Link href="/" className="mt-3 flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" /> Continuar comprando
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
