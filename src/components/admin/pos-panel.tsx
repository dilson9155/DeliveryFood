"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Banknote,
  Check,
  CreditCard,
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
import { createPosOrderAction, quickCreateCustomerAction } from "@/app/actions/pos";
import { cn, formatCurrency, formatPhone } from "@/lib/format";
import {
  cartItemKey,
  describeOptions,
  type OptionChoice,
  type OptionGroupView,
} from "@/lib/product-options";

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

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function PosPanel({
  products,
  customers: initialCustomers,
  canConfirmPayments,
}: {
  products: PosProduct[];
  customers: PosCustomerView[];
  canConfirmPayments: boolean;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [observation, setObservation] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paidNow, setPaidNow] = useState(canConfirmPayments);
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
  const [success, setSuccess] = useState<{ number: number; id: string; total: number } | null>(null);

  const categories = useMemo(
    () => ["Todos", ...new Set(products.map((product) => product.categoryName))],
    [products]
  );

  const filteredProducts = useMemo(() => {
    const term = normalize(query.trim());
    return products.filter((product) => {
      if (category !== "Todos" && product.categoryName !== category) return false;
      if (!term) return true;
      return (
        normalize(product.name).includes(term) || normalize(product.categoryName).includes(term)
      );
    });
  }, [products, query, category]);

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

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function addItem(
    product: PosProduct,
    options: OptionChoice[],
    unitPrice: number
  ) {
    const key = cartItemKey(product.id, options);
    setCart((prev) => {
      const existing = prev.find((item) => item.key === key);
      if (existing) {
        return prev.map((item) =>
          item.key === key ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          name: product.name,
          unitPrice,
          quantity: 1,
          options,
        },
      ];
    });
    setSuccess(null);
  }

  function addProduct(product: PosProduct) {
    if (product.optionGroups.length > 0) {
      setConfiguring(product);
      return;
    }
    addItem(product, [], product.price);
  }

  function changeQuantity(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((item) => (item.key === key ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  function choosePayment(method: PaymentMethod) {
    setPaymentMethod(method);
    setPaidNow(canConfirmPayments && method !== "PIX");
    focusSearch();
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

  function finalize() {
    if (cart.length === 0) {
      show("error", "Adicione itens ao carrinho.");
      return;
    }
    if (!selectedCustomer) {
      show("error", "Selecione ou cadastre um cliente para finalizar.");
      openCustomerModal();
      return;
    }

    startTransition(async () => {
      const result = await createPosOrderAction({
        customerId: selectedCustomer.id,
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
        observation,
      });

      if (!result.ok) {
        show("error", result.error);
        return;
      }

      setCart([]);
      setObservation("");
      setSuccess({ number: result.number, id: result.orderId, total: result.total });
      show("success", `Pedido #${result.number} registrado.`);
      focusSearch();
    });
  }

  function focusSearch() {
    document.getElementById("pos-product-search")?.focus();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">PDV — Balcão e salão</h1>
          <p className="text-sm text-muted-foreground">
            Venda rápida, sem entrega. Busque um produto e pressione Enter.
          </p>
        </div>
        <Link
          href="/admin/comandas"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted"
        >
          <PackageCheck className="h-4 w-4" /> Ver comandas
        </Link>
      </div>

      {success && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="h-5 w-5" />
              </span>
              <div>
                <p className="font-bold">Pedido #{String(success.number).padStart(4, "0")} registrado</p>
                <p className="text-sm text-muted-foreground">{formatCurrency(success.total)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/recibo/${success.id}`}
                target="_blank"
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Receipt className="h-4 w-4" /> Imprimir recibo
              </Link>
              <Button size="sm" variant="ghost" onClick={() => setSuccess(null)}>
                <X className="h-4 w-4" /> Fechar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px_320px]">
        {/* Produtos */}
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle>Produtos</CardTitle>
            <div className="relative">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="pos-product-search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredProducts.length > 0) {
                    e.preventDefault();
                    addProduct(filteredProducts[0]);
                  }
                }}
                placeholder="Buscar produto (nome ou categoria)..."
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    category === item
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {filteredProducts.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nenhum produto encontrado.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product)}
                    className="flex min-h-[92px] flex-col justify-between rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
                  >
                    <span className="line-clamp-2 text-sm font-semibold">{product.name}</span>
                    <span className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{product.categoryName}</span>
                      <span className="font-bold text-brand-700">
                        {formatCurrency(product.price)}
                      </span>
                    </span>
                    {product.optionGroups.length > 0 && (
                      <span className="mt-1 text-[11px] font-medium text-brand-700">Montar ▸</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Carrinho */}
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-brand-600" /> Carrinho
            </CardTitle>
            {cart.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setCart([])}>
                Limpar
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {cart.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nenhum item. Clique em um produto para adicionar.
              </p>
            ) : (
              <>
                <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div key={item.key} className="rounded-xl border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{item.name}</p>
                          {item.options.length > 0 && (
                            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                              {describeOptions(item.options)}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-brand-700">
                            {formatCurrency(item.unitPrice)} / un.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => changeQuantity(item.key, -item.quantity)}
                          className="text-muted-foreground hover:text-danger"
                          aria-label={`Remover ${item.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => changeQuantity(item.key, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border"
                            aria-label="Diminuir quantidade"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => changeQuantity(item.key, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border"
                            aria-label="Aumentar quantidade"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span className="font-bold">
                          {formatCurrency(item.unitPrice * item.quantity)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-sm text-muted-foreground">{itemCount} item(ns)</span>
                  <span className="text-xl font-extrabold text-brand-700">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Cliente + pagamento */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-brand-600" /> Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedCustomer ? (
                <div className="flex items-start justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{selectedCustomer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedCustomer.phone
                        ? formatPhone(selectedCustomer.phone)
                        : selectedCustomer.email || "Sem contato"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {selectedCustomer.ordersCount} pedido(s)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Trocar cliente"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  Nenhum cliente selecionado
                </p>
              )}
              <Button variant="outline" className="mt-2 w-full" onClick={openCustomerModal}>
                <Search className="h-4 w-4" />
                {selectedCustomer ? "Buscar outro cliente" : "Buscar ou cadastrar cliente"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENTS.map((payment) => (
                  <button
                    key={payment.value}
                    type="button"
                    onClick={() => choosePayment(payment.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors",
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

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3">
                <input
                  type="checkbox"
                  checked={paidNow}
                  disabled={!canConfirmPayments}
                  onChange={(e) => setPaidNow(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#FF9800]"
                />
                <span>
                  <span className="block text-sm font-medium">Pagamento recebido agora</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {!canConfirmPayments
                      ? "Peça ao caixa para registrar o recebimento."
                      : paidNow
                        ? "Registra entrada no caixa e pedido como pronto."
                        : "Pedido fica a pagar; confirme depois em Pedidos."}
                  </span>
                </span>
              </label>

              <div>
                <Label htmlFor="pos-observation">Observação</Label>
                <Textarea
                  id="pos-observation"
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Ex.: sem cebola, ponto da carne..."
                  className="min-h-[64px]"
                  maxLength={500}
                />
              </div>

              <Button
                size="lg"
                className="w-full text-base"
                disabled={pending || cart.length === 0}
                onClick={finalize}
              >
                {pending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Check className="h-5 w-5" />
                )}
                {pending ? "Registrando..." : `Finalizar · ${formatCurrency(subtotal)}`}
              </Button>
              {canConfirmPayments && paidNow && (
                <p className="text-center text-[11px] text-muted-foreground">
                  É necessário ter caixa aberto para registrar o recebimento.
                </p>
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
            addItem(configuring, choices, unitPrice);
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
                  {creatingCustomer ? "Cadastro rápido" : "Buscar cliente"}
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
                    <UserPlus className="h-4 w-4" /> Cadastrar novo cliente
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
