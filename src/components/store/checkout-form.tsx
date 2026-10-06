"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Clock,
  Phone,
  Banknote,
  CreditCard,
  QrCode,
  ShoppingBag,
  Loader2,
  MessageSquareText,
  UtensilsCrossed,
  X,
  Bike,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { useCart, cartSubtotal } from "@/stores/cart";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { formatCurrency } from "@/lib/format";
import { createOrderAction } from "@/app/actions/orders";
import { updateProfileAction } from "@/app/actions/profile";
import {
  quoteDeliveryAction,
  saveAddressAction,
  setDefaultAddressAction,
} from "@/app/actions/delivery";
import type { PaymentMethod } from "@prisma/client";

type PaymentOption = { value: PaymentMethod; label: string; icon: React.ReactNode; note: string };

const PAYMENT_OPTIONS: PaymentOption[] = [
  { value: "CASH", label: "Dinheiro", icon: <Banknote className="h-5 w-5" />, note: "Pague na entrega" },
  { value: "CARD", label: "Cartão", icon: <CreditCard className="h-5 w-5" />, note: "Débito ou crédito na entrega" },
  { value: "PIX", label: "PIX", icon: <QrCode className="h-5 w-5" />, note: "Pague na entrega" },
];

type Address = {
  id: string;
  label: string | null;
  recipientName: string | null;
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
    baseFee: number;
    feePerKm: number;
    minFee: number;
    maxFee: number;
    maxDistanceKm: number;
  };
  hours: { dayOfWeek: number; open: boolean; openTime: string; closeTime: string }[];
  savedAddresses: Address[];
  deliveryEnabled: boolean;
};

export function CheckoutForm({
  customer,
  open,
  statusMessage,
  settings,
  hours,
  savedAddresses,
  deliveryEnabled,
}: CheckoutProps) {
  const router = useRouter();
  const { items, clear } = useCart();
  const { show } = useToast();
  const [mode, setMode] = useState<"PICKUP" | "DELIVERY">(deliveryEnabled ? "DELIVERY" : "PICKUP");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [observation, setObservation] = useState(customer.defaultObservation ?? "");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Endereço
  const [selectedAddressId, setSelectedAddressId] = useState<string | "new" | null>(
    savedAddresses.find((a) => a.isDefault)?.id ?? savedAddresses[0]?.id ?? null
  );
  const [showNewAddress, setShowNewAddress] = useState(savedAddresses.length === 0);
  const [address, setAddress] = useState({
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    zipCode: "",
  });

  // Cotação
  const [quote, setQuote] = useState<
    | { ok: true; distanceKm: number; fee: number; etaMinutes: number; lat: number; lng: number }
    | { ok: false; error: string }
    | null
  >(null);
  const [isQuoting, setIsQuoting] = useState(false);

  const subtotal = cartSubtotal(items);

  const effectiveAddress = useMemo(() => {
    if (selectedAddressId && selectedAddressId !== "new") {
      return savedAddresses.find((a) => a.id === selectedAddressId) ?? null;
    }
    if (showNewAddress && address.street && address.city && address.zipCode) return address;
    return null;
  }, [selectedAddressId, savedAddresses, showNewAddress, address]);

  // Recalcula cotação quando endereço muda
  useEffect(() => {
    if (mode !== "DELIVERY" || !effectiveAddress) {
      setQuote(null);
      return;
    }
    setIsQuoting(true);
    const payload = {
      street: effectiveAddress.street,
      number: effectiveAddress.number,
      complement: effectiveAddress.complement ?? "",
      neighborhood: effectiveAddress.neighborhood,
      city: effectiveAddress.city,
      state: effectiveAddress.state,
      zipCode: effectiveAddress.zipCode,
    };
    let cancelled = false;
    quoteDeliveryAction(payload)
      .then((res) => {
        if (!cancelled) setQuote(res);
      })
      .catch(() => {
        if (!cancelled) setQuote({ ok: false, error: "Falha ao calcular a entrega." });
      })
      .finally(() => {
        if (!cancelled) setIsQuoting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, effectiveAddress?.street, effectiveAddress?.number]); // eslint-disable-line

  const total = useMemo(() => {
    if (mode === "DELIVERY" && quote?.ok) return subtotal + quote.fee;
    return subtotal;
  }, [mode, quote, subtotal]);

  const submit = useMemo(
    () => () => {
      const obsToSend = observation.trim();
      startTransition(async () => {
        let delivery:
          | {
              mode: "PICKUP" | "DELIVERY";
              addressId?: string;
              address?: typeof address;
              distanceKm?: number;
              lat?: number;
              lng?: number;
              fee?: number;
            }
          | undefined;

        if (mode === "DELIVERY") {
          if (!effectiveAddress) {
            show("error", "Informe um endereço de entrega.");
            return;
          }
          if (!quote?.ok) {
            show("error", quote?.error ?? "Não foi possível calcular a entrega.");
            return;
          }

          // Se for endereço novo, salva primeiro
          let addressId: string | undefined;
          if (selectedAddressId === "new" || showNewAddress) {
            const saveRes = await saveAddressAction({
              ...address,
              makeDefault: saveAsDefault,
            });
            if (!saveRes.ok) {
              show("error", saveRes.error);
              return;
            }
            addressId = saveRes.addressId;
          } else {
            addressId = selectedAddressId ?? undefined;
            if (saveAsDefault && addressId) {
              await setDefaultAddressAction(addressId);
            }
          }

          delivery = {
            mode: "DELIVERY",
            addressId,
            distanceKm: quote.distanceKm,
            fee: quote.fee,
            lat: quote.lat,
            lng: quote.lng,
          };
        }

        const result = await createOrderAction({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          paymentMethod,
          observation: obsToSend || null,
          delivery,
        });
        if (!result.ok) {
          show("error", result.error);
          return;
        }
        if (
          saveAsDefault &&
          obsToSend &&
          obsToSend !== (customer.defaultObservation ?? "")
        ) {
          updateProfileAction({
            name: customer.name,
            phone: customer.phone ?? "",
            defaultObservation: obsToSend,
          }).catch(() => undefined);
        }
        clear();
        show("success", `Pedido #${result.number} realizado!`);
        router.push(`/pedido/${result.orderId}`);
      });
    },
    [
      items,
      paymentMethod,
      observation,
      saveAsDefault,
      customer,
      mode,
      effectiveAddress,
      quote,
      selectedAddressId,
      showNewAddress,
      address,
      clear,
      router,
      show,
    ]
  );

  if (items.length === 0) {
    return (
      <div className="container-store py-10">
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" />}
          title="Seu carrinho está vazio"
          description="Adicione produtos antes de finalizar o pedido."
          action={
            <Link href="/">
              <Button variant="outline">Ver produtos</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-store py-6">
      <h1 className="mb-5 text-xl font-bold sm:text-2xl">Finalizar pedido</h1>

      {!open && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {statusMessage}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {/* Modalidade */}
          {deliveryEnabled && (
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
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    mode === "DELIVERY" ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    <Bike className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">Entrega</span>
                    <span className="block text-xs text-muted-foreground">Receber no seu endereço</span>
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
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    mode === "PICKUP" ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    <UtensilsCrossed className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">Retirada</span>
                    <span className="block text-xs text-muted-foreground">Buscar na loja</span>
                  </span>
                  {mode === "PICKUP" && <CheckCircle2 className="h-5 w-5 text-brand-600" />}
                </button>
              </div>
            </section>
          )}

          {/* Endereço de entrega */}
          {mode === "DELIVERY" && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <MapPin className="h-4 w-4 text-brand-600" />
                  Endereço de entrega
                </h2>
                {savedAddresses.length > 0 && !showNewAddress && (
                  <button
                    type="button"
                    onClick={() => setShowNewAddress(true)}
                    className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Novo
                  </button>
                )}
              </div>

              {!showNewAddress && savedAddresses.length > 0 && (
                <div className="space-y-2">
                  {savedAddresses.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelectedAddressId(a.id)}
                      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        selectedAddressId === a.id
                          ? "border-brand-600 bg-brand-50"
                          : "border-border bg-background hover:bg-muted/50"
                      }`}
                    >
                      <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        selectedAddressId === a.id ? "border-brand-600" : "border-border"
                      }`}>
                        {selectedAddressId === a.id && (
                          <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
                        )}
                      </span>
                      <span className="flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {a.label ? `${a.label} · ` : ""}
                          {a.street}, {a.number}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {a.neighborhood} · {a.city}/{a.state} · CEP {a.zipCode}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {showNewAddress && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-1">
                      <label className="text-xs text-muted-foreground">CEP</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={address.zipCode}
                        onChange={(e) => setAddress({ ...address, zipCode: e.target.value })}
                        placeholder="00000-000"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-muted-foreground">Rua</label>
                      <input
                        type="text"
                        value={address.street}
                        onChange={(e) => setAddress({ ...address, street: e.target.value })}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Número</label>
                      <input
                        type="text"
                        value={address.number}
                        onChange={(e) => setAddress({ ...address, number: e.target.value })}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-muted-foreground">Complemento (opcional)</label>
                      <input
                        type="text"
                        value={address.complement}
                        onChange={(e) => setAddress({ ...address, complement: e.target.value })}
                        placeholder="Apto, bloco, referência..."
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Bairro</label>
                      <input
                        type="text"
                        value={address.neighborhood}
                        onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Cidade</label>
                      <input
                        type="text"
                        value={address.city}
                        onChange={(e) => setAddress({ ...address, city: e.target.value })}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">UF</label>
                      <input
                        type="text"
                        maxLength={2}
                        value={address.state}
                        onChange={(e) =>
                          setAddress({ ...address, state: e.target.value.toUpperCase() })
                        }
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={saveAsDefault}
                      onChange={(e) => setSaveAsDefault(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border text-brand-600 focus:ring-brand-500"
                    />
                    Salvar este endereço
                  </label>
                </div>
              )}

              {isQuoting && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Calculando frete...
                </div>
              )}
              {quote && quote.ok && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-xs">
                  <span>
                    Entrega: <strong>{quote.distanceKm.toFixed(1)} km</strong> · ~{quote.etaMinutes} min
                  </span>
                  <span className="font-bold text-brand-700">{formatCurrency(quote.fee)}</span>
                </div>
              )}
              {quote && !quote.ok && (
                <div className="mt-3 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
                  {quote.error}
                </div>
              )}
            </section>
          )}

          {/* Dados do cliente */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-bold">Dados do cliente</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Nome</p>
                <p className="text-sm font-medium">{customer.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <p className="text-sm font-medium">{customer.phone ?? "-"}</p>
              </div>
            </div>
          </section>

          {/* Pagamento */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-bold">Forma de pagamento</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              O pagamento será realizado <strong>{mode === "DELIVERY" ? "na entrega" : "somente na retirada"}</strong>.
            </p>
            <div className="grid gap-2">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMethod(opt.value)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    paymentMethod === opt.value
                      ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                      : "border-border bg-background hover:bg-muted/50"
                  }`}
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    paymentMethod === opt.value ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {opt.icon}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{opt.label}</span>
                    <span className="block text-xs text-muted-foreground">{opt.note}</span>
                  </span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                    paymentMethod === opt.value ? "border-brand-600" : "border-border"
                  }`}>
                    {paymentMethod === opt.value && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Observação */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
              <MessageSquareText className="h-4 w-4 text-muted-foreground" />
              Observação do pedido
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Ex.: sem cebola, adicionar ketchup, trocar refrigerante.
            </p>
            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Alguma observação? (opcional)"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-brand-600 focus:ring-brand-500"
              />
              Salvar como observação padrão para meus próximos pedidos
            </label>
          </section>

          {/* Loja */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <MapPin className="h-4 w-4 text-brand-600" />
              {mode === "DELIVERY" ? "Endereço da loja" : "Retirada no estabelecimento"}
            </h2>
            <p className="text-sm font-medium">{settings.storeName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {settings.address}
              {settings.number ? `, ${settings.number}` : ""}
              {settings.complement ? ` - ${settings.complement}` : ""}
              {settings.neighborhood ? `, ${settings.neighborhood}` : ""}
              {settings.city ? ` — ${settings.city}` : ""}
              {settings.state ? `/${settings.state}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {settings.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {settings.phone}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> Tempo de preparo: {settings.prepTimeMinutes ?? 30} min
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {hours
                .filter((h) => h.open)
                .map((h) => (
                  <li key={h.dayOfWeek}>
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][h.dayOfWeek]}:{" "}
                    {h.openTime} às {h.closeTime}
                  </li>
                ))}
            </ul>
          </section>
        </div>

        <aside className="lg:sticky lg:top-20 h-fit">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold">Resumo do pedido</h2>
            <ul className="mb-4 space-y-2.5">
              {items.map((i) => (
                <li key={i.productId} className="flex items-start justify-between gap-2 text-sm">
                  <span className="flex-1">
                    <span className="font-medium text-foreground">{i.quantity}× {i.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatCurrency(i.unitPrice)} cada
                    </span>
                  </span>
                  <span className="font-semibold">{formatCurrency(i.unitPrice * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mb-4 space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {mode === "DELIVERY" && quote?.ok && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Entrega</span>
                  <span>{formatCurrency(quote.fee)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-xl font-extrabold text-brand-700">{formatCurrency(total)}</span>
              </div>
            </div>
            <Button
              className="w-full"
              size="lg"
              disabled={
                !open ||
                isPending ||
                (mode === "DELIVERY" && (!effectiveAddress || !quote?.ok))
              }
              onClick={submit}
            >
              {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <UtensilsCrossed className="h-4 w-4" />}
              {isPending ? "Enviando pedido..." : "Confirmar pedido"}
            </Button>
            <Link
              href="/"
              className="mt-3 flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Continuar comprando
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}