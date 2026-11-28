"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Bike,
  CheckCircle2,
  Clock,
  CreditCard,
  ImageIcon,
  Loader2,
  LogIn,
  MapPin,
  Minus,
  Plus,
  QrCode,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { useToast } from "@/components/ui/toast";
import { createDailyMenuOrderAction } from "@/app/actions/daily-menu";
import { menuDateLabel, menuRemainingLabel } from "@/lib/daily-menu";
import { cn, formatCurrency } from "@/lib/format";
import type { PaymentMethod } from "@prisma/client";

type MealPrice = { id: string; mealId: string; sizeId: string; price: number };
type Meal = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  availableQty: number | null;
  active: boolean;
  order: number;
  prices: MealPrice[];
};
type Size = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  order: number;
};
type Menu = {
  id: string;
  date: string;
  title: string | null;
  active: boolean;
  meals: Meal[];
  sizes: Size[];
};
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

const PAYMENTS: { value: PaymentMethod; label: string; icon: React.ReactNode; note: string }[] = [
  { value: "PIX", label: "PIX", icon: <QrCode className="h-5 w-5" />, note: "QR Code estático" },
  { value: "CASH", label: "Dinheiro", icon: <Banknote className="h-5 w-5" />, note: "Pague ao receber" },
  { value: "CARD", label: "Cartão", icon: <CreditCard className="h-5 w-5" />, note: "Débito ou crédito" },
];

const fieldClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40";

export function MarmitasDoDia({
  date,
  menu,
  customer,
  open,
  statusMessage,
  deliveryEnabled,
  deliveryFee,
  savedAddresses,
}: {
  date: string;
  menu: Menu | null;
  customer: { name: string; phone: string | null; defaultObservation: string | null } | null;
  open: boolean;
  statusMessage: string;
  deliveryEnabled: boolean;
  deliveryFee: number;
  savedAddresses: Address[];
}) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();

  const meals = menu?.meals ?? [];
  const sizes = menu?.sizes ?? [];
  const [mealId, setMealId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [observation, setObservation] = useState(customer?.defaultObservation ?? "");
  const [mode, setMode] = useState<"PICKUP" | "DELIVERY">(deliveryEnabled ? "DELIVERY" : "PICKUP");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [address, setAddress] = useState({
    street: savedAddresses.find((a) => a.isDefault)?.street ?? savedAddresses[0]?.street ?? "",
    number: savedAddresses.find((a) => a.isDefault)?.number ?? savedAddresses[0]?.number ?? "",
    complement: savedAddresses.find((a) => a.isDefault)?.complement ?? savedAddresses[0]?.complement ?? "",
    neighborhood: savedAddresses.find((a) => a.isDefault)?.neighborhood ?? savedAddresses[0]?.neighborhood ?? "",
    city: savedAddresses.find((a) => a.isDefault)?.city ?? savedAddresses[0]?.city ?? "",
    state: savedAddresses.find((a) => a.isDefault)?.state ?? savedAddresses[0]?.state ?? "",
    zipCode: savedAddresses.find((a) => a.isDefault)?.zipCode ?? savedAddresses[0]?.zipCode ?? "",
  });

  const selectedMeal = meals.find((meal) => meal.id === mealId) ?? null;
  const selectedSize = sizes.find((size) => size.id === sizeId) ?? null;
  const selectedPrice = selectedMeal?.prices.find((price) => price.sizeId === sizeId) ?? null;

  const soldOut = selectedMeal?.availableQty !== null && selectedMeal?.availableQty !== undefined
    ? selectedMeal.availableQty <= 0
    : false;
  const maxQuantity = selectedMeal?.availableQty ?? 99;

  const subtotal = selectedPrice ? selectedPrice.price * quantity : 0;
  const fee = mode === "DELIVERY" ? deliveryFee : 0;
  const total = useMemo(() => subtotal + fee, [subtotal, fee]);

  function chooseMeal(id: string) {
    setMealId(id);
    setQuantity(1);
    const meal = meals.find((item) => item.id === id);
    if (meal && !meal.prices.some((price) => price.sizeId === sizeId)) {
      setSizeId("");
    }
  }

  function submit() {
    if (!open) {
      show("error", statusMessage);
      return;
    }
    if (!customer) {
      router.push("/login?callbackUrl=/marmitas-do-dia");
      return;
    }
    if (!selectedMeal || !selectedSize || !selectedPrice) {
      show("error", "Escolha uma refeição e um tamanho disponíveis.");
      return;
    }
    if (soldOut || quantity > maxQuantity) {
      show("error", "Esta refeição não tem quantidade suficiente.");
      return;
    }
    if (mode === "DELIVERY") {
      if (
        !address.street.trim() ||
        !address.number.trim() ||
        !address.neighborhood.trim() ||
        !address.city.trim() ||
        address.state.trim().length !== 2 ||
        address.zipCode.replace(/\D/g, "").length < 8
      ) {
        show("error", "Preencha rua, número, bairro, cidade, UF e CEP para a entrega.");
        return;
      }
    }
    if (customer.phone && customer.phone.replace(/\D/g, "").length < 10) {
      show("error", "Atualize seu telefone em Meus dados para finalizar o pedido.");
      return;
    }

    startTransition(async () => {
      const result = await createDailyMenuOrderAction({
        mealId: selectedMeal.id,
        sizeId: selectedSize.id,
        quantity,
        paymentMethod,
        observation: observation.trim() || null,
        recipientName: customer.name,
        recipientPhone: customer.phone ?? undefined,
        recipientAddress:
          mode === "DELIVERY"
            ? `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ""} — ${address.neighborhood}, ${address.city}/${address.state} — CEP ${address.zipCode}`.slice(0, 300)
            : null,
        delivery: {
          mode,
          ...(mode === "DELIVERY"
            ? { address: { ...address, complement: address.complement || null } }
            : {}),
        },
      });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      show("success", `Pedido #${result.number} realizado!`);
      router.push(`/pedido/${result.orderId}`);
    });
  }

  if (!menu) {
    return (
      <div className="container-store py-8">
        <EmptyState
          icon={<UtensilsCrossed className="h-8 w-8" />}
          title="Cardápio do dia ainda não disponível"
          description="Volte mais tarde ou peça diretamente do cardápio principal."
          action={
            <Link href="/">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" /> Ver produtos
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-store py-6">
      <div className="mb-5">
        <Link href="/" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao cardápio
        </Link>
        <div className="rounded-3xl bg-gradient-to-br from-[#FF9800] to-[#F57C00] p-5 text-white sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
                Marmitas do dia
              </p>
              <h1 className="mt-1 text-2xl font-black capitalize sm:text-3xl">
                {menu.title?.trim() || `Cardápio de ${menuDateLabel(date)}`}
              </h1>
              <p className="mt-1 text-xs text-white/85">
                Escolha a refeição completa e o tamanho da marmita. Sem complicação com ingredientes.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold">
              <Clock className="h-3.5 w-3.5" />
              {menu.meals.length} opção(ões) · {menu.sizes.length} tamanho(s)
            </span>
          </div>
        </div>
        {!open && (
          <div className="mt-3 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-xs font-medium text-warning">
            {statusMessage} Você pode montar o pedido, mas a confirmação será liberada no horário de funcionamento.
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-sm font-bold">1. Escolha sua refeição completa</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {meals.map((meal) => {
                const mealSoldOut = meal.availableQty !== null && meal.availableQty <= 0;
                const prices = meal.prices.map((price) => price.price);
                const from = prices.length > 0 ? Math.min(...prices) : null;
                const active = mealId === meal.id && !mealSoldOut;
                return (
                  <button
                    key={meal.id}
                    type="button"
                    disabled={mealSoldOut}
                    onClick={() => chooseMeal(meal.id)}
                    className={cn(
                      "overflow-hidden rounded-2xl border bg-card text-left transition-all",
                      active
                        ? "border-brand-600 ring-2 ring-brand-600/30"
                        : "border-border hover:border-brand-300",
                      mealSoldOut && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <div className="relative h-32 bg-muted">
                      {meal.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={meal.imageUrl} alt={meal.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      )}
                      <div className="absolute left-2 top-2">
                        <Badge tone={mealSoldOut ? "danger" : active ? "brand" : "muted"}>
                          {mealSoldOut ? "Esgotado" : menuRemainingLabel(meal.availableQty)}
                        </Badge>
                      </div>
                      {active && (
                        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white">
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-bold">{meal.name}</p>
                      {meal.description && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {meal.description}
                        </p>
                      )}
                      <p className="mt-1.5 text-xs font-extrabold text-brand-700">
                        {from !== null ? `A partir de ${formatCurrency(from)}` : "Preço não cadastrado"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedMeal && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-bold">2. Escolha o tamanho da marmita</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {sizes.map((size) => {
                  const price = selectedMeal.prices.find((item) => item.sizeId === size.id)?.price ?? null;
                  const disabled = price === null;
                  const active = sizeId === size.id;
                  return (
                    <button
                      key={size.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSizeId(size.id)}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left",
                        active
                          ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                          : "border-border bg-background hover:bg-muted/50",
                        disabled && "cursor-not-allowed opacity-50"
                      )}
                    >
                      <span>
                        <span className="block text-xs font-bold">{size.name}</span>
                        {size.description && (
                          <span className="block text-[10px] text-muted-foreground">{size.description}</span>
                        )}
                      </span>
                      <span className="text-xs font-extrabold text-brand-700">
                        {price !== null ? formatCurrency(price) : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-bold">3. Quantidade e observação</h2>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background p-1">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
                  aria-label="Diminuir quantidade"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center text-sm font-extrabold">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
                  aria-label="Aumentar quantidade"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {selectedMeal?.availableQty !== null && selectedMeal?.availableQty !== undefined && (
                <span className="text-[11px] text-muted-foreground">
                  Máximo: {selectedMeal.availableQty} marmita(s)
                </span>
              )}
            </div>
            <textarea
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              placeholder="Observações (opcional)"
              maxLength={500}
              className={cn(fieldClass, "mt-3 min-h-[70px]")}
            />
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-bold">4. Retirada ou entrega</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {deliveryEnabled && (
                <button
                  type="button"
                  onClick={() => setMode("DELIVERY")}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left",
                    mode === "DELIVERY"
                      ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                      : "border-border bg-background hover:bg-muted/50"
                  )}
                >
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", mode === "DELIVERY" ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground")}>
                    <Bike className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-xs font-bold">Entrega</span>
                    <span className="block text-[10px] text-muted-foreground">Taxa fixa de {formatCurrency(deliveryFee)}</span>
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode("PICKUP")}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left",
                  mode === "PICKUP"
                    ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                    : "border-border bg-background hover:bg-muted/50"
                )}
              >
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", mode === "PICKUP" ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground")}>
                  <UtensilsCrossed className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-xs font-bold">Retirada na loja</span>
                  <span className="block text-[10px] text-muted-foreground">Sem taxa de entrega</span>
                </span>
              </button>
            </div>

            {mode === "DELIVERY" && (
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                {savedAddresses.length > 0 && (
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">Endereço salvo</label>
                    <select
                      className={fieldClass}
                      defaultValue={savedAddresses.find((a) => a.isDefault)?.id ?? ""}
                      onChange={(event) => {
                        const found = savedAddresses.find((a) => a.id === event.target.value);
                        if (found) {
                          setAddress({
                            street: found.street,
                            number: found.number,
                            complement: found.complement ?? "",
                            neighborhood: found.neighborhood,
                            city: found.city,
                            state: found.state,
                            zipCode: found.zipCode,
                          });
                        }
                      }}
                    >
                      <option value="">Digitar novo endereço</option>
                      {savedAddresses.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label ?? `${item.street}, ${item.number}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] text-muted-foreground">Rua / Avenida</label>
                    <input className={fieldClass} value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} placeholder="Rua Principal" maxLength={200} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">Número</label>
                    <input className={fieldClass} value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} placeholder="123" maxLength={20} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">Complemento</label>
                    <input className={fieldClass} value={address.complement ?? ""} onChange={(e) => setAddress({ ...address, complement: e.target.value })} placeholder="Apto 4" maxLength={80} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">Bairro</label>
                    <input className={fieldClass} value={address.neighborhood} onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })} placeholder="Centro" maxLength={80} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">CEP</label>
                    <input className={fieldClass} inputMode="numeric" value={address.zipCode} onChange={(e) => setAddress({ ...address, zipCode: e.target.value })} placeholder="00000000" maxLength={10} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">Cidade</label>
                    <input className={fieldClass} value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} placeholder="Belo Horizonte" maxLength={80} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">UF</label>
                    <input className={fieldClass} value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase().slice(0, 2) })} placeholder="MG" maxLength={2} />
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <ShoppingBag className="h-4 w-4 text-brand-600" /> Resumo do pedido
            </h2>
            <div className="mt-3 space-y-2 border-b border-border pb-3 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Refeição</span>
                <span className="text-right font-semibold">{selectedMeal?.name ?? "Não escolhida"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Tamanho</span>
                <span className="font-semibold">{selectedSize?.name ?? "Não escolhido"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Quantidade</span>
                <span className="font-semibold">{quantity}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Entrega</span>
                <span className="flex items-center gap-1 font-semibold">
                  <MapPin className="h-3 w-3" /> {mode === "DELIVERY" ? "Entrega" : "Retirada"}
                </span>
              </div>
            </div>

            <div className="mt-3">
              <p className="mb-2 text-xs font-bold">Forma de pagamento</p>
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPaymentMethod(option.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10px] font-semibold",
                      paymentMethod === option.value
                        ? "border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600"
                        : "border-border bg-background hover:bg-muted/50"
                    )}
                    title={option.note}
                  >
                    {option.icon}
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {mode === "DELIVERY" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taxa de entrega</span>
                  <span>{formatCurrency(fee)}</span>
                </div>
              )}
              <div className="flex items-end justify-between pt-1">
                <span className="text-sm font-bold">Total</span>
                <span className="text-2xl font-black text-brand-700">{formatCurrency(total)}</span>
              </div>
            </div>

            <Button
              className="mt-4 w-full"
              size="lg"
              onClick={submit}
              disabled={pending || (customer !== null && (!selectedMeal || !selectedPrice || soldOut))}
            >
              {pending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : customer ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <LogIn className="h-5 w-5" />
              )}
              {customer ? "Confirmar pedido" : "Entrar para pedir"}
            </Button>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              {customer
                ? "Preço e disponibilidade são confirmados ao registrar o pedido."
                : "Você pode ver o cardápio sem entrar. Faça login para finalizar o pedido."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
