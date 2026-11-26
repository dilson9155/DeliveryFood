"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Check,
  CreditCard,
  List,
  Loader2,
  Minus,
  PackageCheck,
  Plus,
  QrCode,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { ProductConfigurator } from "@/components/store/product-configurator";
import {
  addComandaItemsAction,
  closeComandaAction,
  setComandaItemQuantityAction,
  setComandaObservationAction,
} from "@/app/actions/comandas";
import { createPosOrderAction, quickCreateCustomerAction } from "@/app/actions/pos";
import { cn, formatCurrency, formatPhone, formatTime, roundMoney } from "@/lib/format";
import {
  cartItemKey,
  describeOptions,
  type OptionChoice,
  type OptionGroupView,
} from "@/lib/product-options";

export type PosComanda = {
  id: string;
  number: number;
  tableName: string;
  customerName: string | null;
  customerPhone: string | null;
  observation: string | null;
  openedAt: string;
  items: {
    id: string;
    productId: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
    options: {
      groupId: string;
      optionId: string;
      groupName: string;
      optionName: string;
      quantity: number;
      unitPrice: number;
    }[];
  }[];
};

type PosProduct = {
  id: string;
  name: string;
  price: number;
  categoryName: string;
  optionGroups: OptionGroupView[];
};

type PosCustomerView = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  ordersCount: number;
};

type CartItem = {
  key: string;
  id?: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  options: OptionChoice[];
};

type PaymentMethod = "CASH" | "CARD" | "PIX";

const PAYMENTS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: "CASH", label: "Dinheiro", icon: <Banknote className="h-4 w-4" /> },
  { value: "CARD", label: "Cartão", icon: <CreditCard className="h-4 w-4" /> },
  { value: "PIX", label: "PIX", icon: <QrCode className="h-4 w-4" /> },
];

const QUICK_ADDS = [5, 10, 20, 50, 100];

function Step({
  number,
  label,
  active,
  done,
}: {
  number: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        active
          ? "bg-[#0F0D0C] text-white"
          : done
            ? "bg-success/15 text-success"
            : "bg-muted text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full text-[9px]",
          active ? "bg-white/20" : done ? "bg-success/25" : "bg-background"
        )}
      >
        {done ? <Check className="h-2.5 w-2.5" /> : number}
      </span>
      {label}
    </span>
  );
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function parseAmount(value: string): number | null {
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? roundMoney(parsed) : null;
}

function itemsFromComanda(comanda: PosComanda): CartItem[] {
  return comanda.items.map((item) => ({
    key: item.id,
    id: item.id,
    productId: item.productId,
    name: item.productName,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    options: item.options.map((option) => ({
      groupId: option.groupId,
      optionId: option.optionId,
      groupName: option.groupName,
      optionName: option.optionName,
      quantity: option.quantity,
      unitPrice: option.unitPrice,
    })),
  }));
}

function addToLocalCart(
  cart: CartItem[],
  product: PosProduct,
  options: OptionChoice[],
  unitPrice: number
): CartItem[] {
  const key = cartItemKey(product.id, options);
  const existing = cart.find((item) => item.key === key);
  if (existing) {
    return cart.map((item) =>
      item.key === key ? { ...item, quantity: item.quantity + 1 } : item
    );
  }
  return [
    ...cart,
    {
      key,
      productId: product.id,
      name: product.name,
      unitPrice,
      quantity: 1,
      options,
    },
  ];
}

export function PosPanel({
  products,
  customers: initialCustomers,
  canConfirmPayments,
  comanda = null,
}: {
  products: PosProduct[];
  customers: PosCustomerView[];
  canConfirmPayments: boolean;
  comanda?: PosComanda | null;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [showProductList, setShowProductList] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(() =>
    comanda ? itemsFromComanda(comanda) : []
  );
  const [observation, setObservation] = useState(comanda?.observation ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paidNow, setPaidNow] = useState(canConfirmPayments);
  const [amountReceived, setAmountReceived] = useState("");
  const [configuring, setConfiguring] = useState<PosProduct | null>(null);
  const [customers, setCustomers] = useState(initialCustomers);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newTaxId, setNewTaxId] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomerView | null>(null);
  const [success, setSuccess] = useState<{
    number: number;
    id: string;
    total: number;
    change: number;
  } | null>(null);

  useEffect(() => {
    setCart(comanda ? itemsFromComanda(comanda) : []);
  }, [comanda]);

  useEffect(() => {
    setObservation(comanda?.observation ?? "");
  }, [comanda?.id]);

  const categories = useMemo(
    () => ["Todos", ...new Set(products.map((product) => product.categoryName))],
    [products]
  );

  const term = normalize(query.trim());
  const visibleProducts = useMemo(() => {
    if (!term && !showProductList) return [];
    return products
      .filter((product) => {
        if (category !== "Todos" && product.categoryName !== category) return false;
        if (!term) return true;
        return (
          normalize(product.name).includes(term) || normalize(product.categoryName).includes(term)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [products, term, category, showProductList]);

  function toggleProductList(checked: boolean) {
    setShowProductList(checked);
    if (!checked) setCategory("Todos");
  }

  const filteredCustomers = useMemo(() => {
    const term = normalize(customerSearch.trim());
    const termDigits = digits(term);
    return customers.filter((customer) => {
      if (!term) return true;
      return (
        normalize(customer.name).includes(term) ||
        (customer.email ?? "").toLowerCase().includes(term) ||
        (termDigits.length > 0 && digits(customer.phone ?? "").includes(termDigits))
      );
    });
  }, [customers, customerSearch]);

  const subtotal = roundMoney(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const showChange = paidNow && paymentMethod === "CASH";
  const receivedValue = amountReceived.trim() ? parseAmount(amountReceived) : null;
  const change =
    showChange && receivedValue !== null ? roundMoney(receivedValue - subtotal) : 0;
  const shortfall =
    showChange && receivedValue !== null && receivedValue < subtotal
      ? roundMoney(subtotal - receivedValue)
      : 0;

  function focusSearch() {
    document.getElementById("pos-product-search")?.focus();
  }

  function addConfigured(
    product: PosProduct,
    options: OptionChoice[],
    unitPrice: number
  ) {
    setSuccess(null);
    setQuery("");
    if (comanda) {
      setCart((prev) => [
        ...prev,
        {
          key: `tmp-${Date.now()}-${Math.random()}`,
          productId: product.id,
          name: product.name,
          unitPrice,
          quantity: 1,
          options,
        },
      ]);
      startTransition(async () => {
        const result = await addComandaItemsAction({
          comandaId: comanda.id,
          items: [
            {
              productId: product.id,
              quantity: 1,
              options: options.map((option) => ({
                groupId: option.groupId,
                optionId: option.optionId,
                quantity: option.quantity,
              })),
            },
          ],
        });
        if (!result.ok) {
          show("error", result.error);
          setCart(itemsFromComanda(comanda));
          return;
        }
        show("success", `${product.name} adicionado à comanda.`);
        router.refresh();
      });
    } else {
      setCart((prev) => addToLocalCart(prev, product, options, unitPrice));
    }
    focusSearch();
  }

  function addProduct(product: PosProduct) {
    if (pending) return;
    if (product.optionGroups.length > 0) {
      setConfiguring(product);
      return;
    }
    addConfigured(product, [], product.price);
  }

  function changeQuantity(item: CartItem, delta: number) {
    const next = item.quantity + delta;
    if (next < 0) return;

    setCart((prev) =>
      prev
        .map((current) => (current.key === item.key ? { ...current, quantity: next } : current))
        .filter((current) => current.quantity > 0)
    );

    if (comanda && item.id) {
      startTransition(async () => {
        const result = await setComandaItemQuantityAction({
          itemId: item.id!,
          quantity: next,
        });
        if (!result.ok) {
          show("error", result.error);
          setCart(itemsFromComanda(comanda));
          return;
        }
        router.refresh();
      });
    }
    setSuccess(null);
  }

  function removeItem(item: CartItem) {
    changeQuantity(item, -item.quantity);
  }

  function saveObservation() {
    if (!comanda) {
      show("info", "Observação mantida nesta venda.");
      return;
    }
    startTransition(async () => {
      const result = await setComandaObservationAction(comanda.id, observation);
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      show("success", "Observação salva.");
      router.refresh();
    });
  }

  function choosePayment(method: PaymentMethod) {
    setPaymentMethod(method);
    if (method !== "CASH") setAmountReceived("");
    setPaidNow(canConfirmPayments && method !== "PIX");
    focusSearch();
  }

  function setQuickAmount(value: number) {
    setAmountReceived(value.toFixed(2).replace(".", ","));
  }

  function finalize() {
    if (!comanda && !selectedCustomer) {
      show("error", "Selecione ou cadastre o cliente antes de finalizar.");
      openCustomerModal();
      return;
    }
    if (cart.length === 0) {
      show("error", "Adicione itens antes de finalizar.");
      return;
    }
    const received = showChange ? parseAmount(amountReceived) ?? undefined : undefined;
    if (showChange && (received === undefined || received < subtotal)) {
      show("error", "Informe um valor recebido maior ou igual ao total.");
      return;
    }

    startTransition(async () => {
      let registeredNumber = 0;
      if (comanda) {
        const result = await closeComandaAction({
          comandaId: comanda.id,
          paymentMethod,
          paidNow,
          amountReceived: received,
        });
        if (!result.ok) {
          show("error", result.error);
          return;
        }
        registeredNumber = result.orderNumber;
        setSuccess({
          number: registeredNumber,
          id: result.orderId,
          total: result.total,
          change: result.change,
        });
      } else {
        const result = await createPosOrderAction({
          customerId: selectedCustomer!.id,
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            options: item.options.map((option) => ({
              groupId: option.groupId,
              optionId: option.optionId,
              quantity: option.quantity,
            })),
          })),
          paymentMethod,
          paidNow,
          amountReceived: received,
          observation,
        });
        if (!result.ok) {
          show("error", result.error);
          return;
        }
        registeredNumber = result.number;
        setSuccess({
          number: registeredNumber,
          id: result.orderId,
          total: result.total,
          change: result.change,
        });
      }

      setCart([]);
      setObservation("");
      setAmountReceived("");
      show("success", `Pedido #${String(registeredNumber).padStart(4, "0")} registrado.`);
      router.refresh();
      focusSearch();
    });
  }

  function openCustomerModal() {
    setCustomerSearch("");
    setCreatingCustomer(false);
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setNewTaxId("");
    setCustomerOpen(true);
  }

  function selectCustomer(customer: PosCustomerView) {
    setSelectedCustomer(customer);
    setCustomerOpen(false);
    focusSearch();
  }

  function saveCustomer() {
    startTransition(async () => {
      const result = await quickCreateCustomerAction({
        name: newName,
        phone: newPhone,
        email: newEmail,
        taxId: newTaxId,
      });
      if (!result.ok) {
        if (result.existing) {
          selectCustomer(result.existing);
          show("info", result.error);
        } else {
          show("error", result.error);
        }
        return;
      }
      setCustomers((prev) => [result.customer, ...prev]);
      selectCustomer(result.customer);
      show("success", `Cliente ${result.customer.name} cadastrado.`);
    });
  }

  function resetSale() {
    setCart(comanda ? itemsFromComanda(comanda) : []);
    setSuccess(null);
    setAmountReceived("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold sm:text-2xl">PDV — Balcão e salão</h1>
            {comanda && (
              <span className="rounded-full bg-[#0F0D0C] px-2.5 py-1 text-[11px] font-semibold text-white">
                Comanda #{String(comanda.number).padStart(4, "0")} · {comanda.tableName}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {comanda
              ? "Cliente da comanda definido. Edite os itens, receba e informe o troco."
              : "Escolha o cliente, adicione os produtos e só depois finalize."}
          </p>
        </div>
        <Link
          href="/admin/comandas"
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted"
        >
          <PackageCheck className="h-4 w-4" /> Ver comandas
        </Link>
      </div>

      {success && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold">
                  Pedido #{String(success.number).padStart(4, "0")} registrado
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(success.total)}
                  {success.change > 0 ? ` · Troco ${formatCurrency(success.change)}` : ""}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/recibo/${success.id}`}
                target="_blank"
                className="inline-flex h-8 items-center gap-2 rounded-xl bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <Receipt className="h-4 w-4" /> Imprimir recibo
              </Link>
              <Link
                href="/admin/pdv"
                className="inline-flex h-8 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted"
              >
                Nova venda
              </Link>
              <Button size="sm" variant="ghost" onClick={() => setSuccess(null)}>
                <X className="h-4 w-4" /> Fechar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Step
          number={1}
          label="Cliente"
          active={!comanda && !selectedCustomer}
          done={Boolean(comanda || selectedCustomer)}
        />
        <span className="text-[10px] text-muted-foreground">→</span>
        <Step
          number={2}
          label="Produtos"
          active={(Boolean(comanda) || Boolean(selectedCustomer)) && cart.length === 0}
          done={cart.length > 0}
        />
        <span className="text-[10px] text-muted-foreground">→</span>
        <Step number={3} label="Finalizar" active={cart.length > 0} done={false} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand-200 bg-brand-50/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F0D0C] text-[11px] font-bold text-white">
            {comanda ? String(comanda.number).padStart(4, "0") : <UserRound className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {comanda ? "Comanda" : "Cliente da venda"}
            </p>
            <p className="truncate text-sm font-bold">
              {comanda
                ? `${comanda.customerName || "Consumidor final"} · ${comanda.tableName}`
                : selectedCustomer
                  ? selectedCustomer.name
                  : "Selecione ou cadastre o cliente"}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {comanda
                ? `Comanda #${String(comanda.number).padStart(4, "0")} · aberta às ${formatTime(comanda.openedAt)}`
                : selectedCustomer
                  ? `${selectedCustomer.phone ? formatPhone(selectedCustomer.phone) : selectedCustomer.email || "Sem contato"} · ${selectedCustomer.ordersCount} pedido(s)`
                  : "Escolha o cliente antes de adicionar os produtos."}
            </p>
          </div>
        </div>
        {!comanda && (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant={selectedCustomer ? "outline" : "default"}
              onClick={openCustomerModal}
            >
              <Search className="h-4 w-4" /> {selectedCustomer ? "Trocar cliente" : "Buscar cliente"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                openCustomerModal();
                setCreatingCustomer(true);
              }}
            >
              <UserPlus className="h-4 w-4" /> Cadastro rápido
            </Button>
          </div>
        )}
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_330px_320px]">
        {/* Produtos */}
        <Card className="min-w-0">
          <CardHeader className="gap-2 pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span>Produtos</span>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showProductList}
                  onChange={(e) => toggleProductList(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#FF9800]"
                />
                <List className="h-3.5 w-3.5" /> Listar produtos
              </label>
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="pos-product-search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && visibleProducts.length > 0) {
                    e.preventDefault();
                    addProduct(visibleProducts[0]);
                  }
                }}
                placeholder="Digite o nome do produto..."
                className="h-10 pl-9 text-sm"
              />
            </div>
            {showProductList && (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                      category === item
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {visibleProducts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {term
                  ? "Nenhum produto encontrado."
                  : "Digite o nome do produto ou marque Listar produtos."}
              </p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2 2xl:grid-cols-3">
                {visibleProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    disabled={pending}
                    onClick={() => addProduct(product)}
                    className="flex min-h-[76px] flex-col justify-between rounded-xl border border-border bg-background p-2.5 text-left transition-colors hover:border-brand-500 hover:bg-brand-50 disabled:opacity-60"
                  >
                    <span className="line-clamp-2 text-xs font-semibold leading-tight">
                      {product.name}
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] text-muted-foreground">
                        {product.categoryName}
                      </span>
                      <span className="shrink-0 text-xs font-bold text-brand-700">
                        {formatCurrency(product.price)}
                      </span>
                    </span>
                    {product.optionGroups.length > 0 && (
                      <span className="text-[10px] font-medium text-brand-700">Montar ▸</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Carrinho / itens da comanda */}
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4 text-brand-600" />
              {comanda ? "Itens da comanda" : "Carrinho"}
            </CardTitle>
            {!comanda && cart.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setCart([])}>
                Limpar
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {cart.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Clique em um produto para adicionar.
              </p>
            ) : (
              <>
                <div className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div key={item.key} className="rounded-xl border border-border px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold leading-tight">
                            {item.name}
                          </p>
                          {item.options.length > 0 && (
                            <p className="truncate text-[10px] text-brand-700">
                              {describeOptions(item.options)}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => changeQuantity(item, -1)}
                            className="flex h-6 w-6 items-center justify-center rounded-lg border border-border disabled:opacity-50"
                            aria-label={`Diminuir ${item.name}`}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-5 text-center text-xs font-bold">{item.quantity}</span>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => changeQuantity(item, 1)}
                            className="flex h-6 w-6 items-center justify-center rounded-lg border border-border disabled:opacity-50"
                            aria-label={`Aumentar ${item.name}`}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => removeItem(item)}
                            className="ml-0.5 text-muted-foreground hover:text-danger disabled:opacity-50"
                            aria-label={`Remover ${item.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{formatCurrency(item.unitPrice)} / un.</span>
                        <span className="font-bold text-foreground">
                          {formatCurrency(item.unitPrice * item.quantity)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-[11px] text-muted-foreground">{itemCount} item(ns)</span>
                  <span className="text-xl font-extrabold text-brand-700">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
              </>
            )}

            <div className="border-t border-border pt-2">
              <Label htmlFor="pos-observation" className="text-[11px]">
                Observação {comanda ? "da comanda" : "do pedido"}
              </Label>
              <div className="flex gap-1.5">
                <Textarea
                  id="pos-observation"
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Ex.: sem cebola, ponto da carne..."
                  className="min-h-[48px] py-1.5 text-xs"
                  maxLength={500}
                />
                {comanda && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={saveObservation}
                    className="shrink-0"
                  >
                    Salvar
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cliente + pagamento */}
        <div className="space-y-3">
          <Card className="border-brand-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENTS.map((payment) => (
                  <button
                    key={payment.value}
                    type="button"
                    onClick={() => choosePayment(payment.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border py-2 text-[11px] font-medium transition-colors",
                      paymentMethod === payment.value
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {payment.icon}
                    {payment.label}
                  </button>
                ))}
              </div>

              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border p-2.5">
                <input
                  type="checkbox"
                  checked={paidNow}
                  disabled={!canConfirmPayments}
                  onChange={(e) => setPaidNow(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#FF9800]"
                />
                <span>
                  <span className="block text-xs font-medium">Recebido agora</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {!canConfirmPayments
                      ? "Peça ao caixa para confirmar."
                      : paidNow
                        ? "Registra entrada no caixa."
                        : "Fica a pagar; confirme depois."}
                  </span>
                </span>
              </label>

              {showChange && (
                <div className="rounded-2xl bg-[#0F0D0C] p-3 text-white">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="pos-amount-received" className="mb-0 text-[11px] text-white/70">
                      Valor recebido
                    </Label>
                    <span className="text-[10px] text-white/60">Total {formatCurrency(subtotal)}</span>
                  </div>
                  <Input
                    id="pos-amount-received"
                    autoComplete="off"
                    inputMode="decimal"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    placeholder="0,00"
                    className="mt-1.5 h-11 border-white/15 bg-white/10 text-lg font-bold text-white placeholder:text-white/30"
                  />
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setQuickAmount(subtotal)}
                      className="h-7 rounded-lg bg-white/10 px-2 text-[10px] font-semibold hover:bg-white/20"
                    >
                      Exato
                    </button>
                    {QUICK_ADDS.map((addition) => (
                      <button
                        key={addition}
                        type="button"
                        onClick={() => setQuickAmount(subtotal + addition)}
                        className="h-7 rounded-lg bg-white/10 px-2 text-[10px] font-semibold hover:bg-white/20"
                      >
                        +{addition}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2.5 flex items-end justify-between border-t border-white/10 pt-2.5">
                    <div>
                      <p className="text-[10px] text-white/60">Troco</p>
                      <p
                        className={cn(
                          "text-2xl font-extrabold leading-none",
                          shortfall > 0 ? "text-red-300" : "text-[#FFB74D]"
                        )}
                      >
                        {receivedValue === null ? "—" : formatCurrency(Math.max(change, 0))}
                      </p>
                    </div>
                    {shortfall > 0 && (
                      <p className="text-right text-[10px] text-red-300">
                        Faltam {formatCurrency(shortfall)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <Button
                size="lg"
                className="h-12 w-full text-sm"
                disabled={pending || cart.length === 0 || (!comanda && !selectedCustomer)}
                title={
                  !comanda && !selectedCustomer
                    ? "Selecione o cliente para finalizar"
                    : cart.length === 0
                      ? "Adicione produtos para finalizar"
                      : undefined
                }
                onClick={finalize}
              >
                {pending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Check className="h-5 w-5" />
                )}
                {pending
                  ? "Registrando..."
                  : `${comanda ? "Fechar comanda" : "Finalizar"} · ${formatCurrency(subtotal)}`}
              </Button>
              {canConfirmPayments && paidNow && (
                <p className="text-center text-[10px] text-muted-foreground">
                  É necessário ter caixa aberto para registrar o recebimento.
                </p>
              )}
              {comanda && (
                <button
                  type="button"
                  onClick={resetSale}
                  className="w-full text-center text-[10px] text-brand-700 underline"
                >
                  Recarregar itens salvos
                </button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {configuring && (
        <ProductConfigurator
          product={configuring}
          groups={configuring.optionGroups}
          onAdd={(choices, unitPrice) => {
            addConfigured(configuring, choices, unitPrice);
            setConfiguring(null);
            focusSearch();
          }}
          onClose={() => {
            setConfiguring(null);
            focusSearch();
          }}
        />
      )}

      {customerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div
            className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-bold">
                  {creatingCustomer ? "Cadastro rápido" : "1. Buscar cliente"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {creatingCustomer
                    ? "Nome e telefone são suficientes."
                    : "Busque por nome, telefone ou e-mail."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustomerOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {creatingCustomer ? (
              <div className="space-y-3 overflow-y-auto px-5 py-4">
                <div>
                  <Label htmlFor="pos-new-name">Nome *</Label>
                  <Input
                    id="pos-new-name"
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nome do cliente"
                  />
                </div>
                <div>
                  <Label htmlFor="pos-new-phone">Telefone com DDD *</Label>
                  <Input
                    id="pos-new-phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="31999999999"
                    inputMode="numeric"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="pos-new-email">E-mail (opcional)</Label>
                    <Input
                      id="pos-new-email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="cliente@email.com"
                      type="email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pos-new-taxid">CPF/CNPJ (opcional)</Label>
                    <Input
                      id="pos-new-taxid"
                      value={newTaxId}
                      onChange={(e) => setNewTaxId(e.target.value)}
                      placeholder="Somente se informado"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={pending || !newName.trim() || digits(newPhone).length < 10}
                  onClick={saveCustomer}
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Cadastrar e selecionar
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setCreatingCustomer(false)}
                >
                  Voltar para a busca
                </Button>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="px-5 py-4">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Nome, telefone ou e-mail..."
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="min-h-[180px] flex-1 space-y-1.5 overflow-y-auto px-5 pb-3">
                  {filteredCustomers.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum cliente encontrado.
                    </p>
                  ) : (
                    filteredCustomers.slice(0, 80).map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => selectCustomer(customer)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left hover:border-brand-400 hover:bg-brand-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{customer.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {customer.phone ? formatPhone(customer.phone) : customer.email || "—"}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {customer.ordersCount} pedido(s)
                        </span>
                      </button>
                    ))
                  )}
                </div>
                <div className="border-t border-border p-5">
                  <Button className="w-full" onClick={() => setCreatingCustomer(true)}>
                    <UserPlus className="h-4 w-4" /> Cadastro rápido
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
