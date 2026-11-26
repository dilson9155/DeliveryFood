"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  Banknote,
  Check,
  ChevronDown,
  CreditCard,
  LayoutGrid,
  Loader2,
  Minus,
  Plus,
  Printer,
  QrCode,
  Receipt as ReceiptIcon,
  Search,
  ShoppingCart,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { ProductConfigurator } from "@/components/store/product-configurator";
import {
  addComandaItemsAction,
  cancelComandaAction,
  closeComandaAction,
  openComandaAction,
  setComandaItemQuantityAction,
  setComandaObservationAction,
  transferComandaAction,
} from "@/app/actions/comandas";
import { cn, formatCurrency, formatTime } from "@/lib/format";
import {
  cartItemKey,
  describeOptions,
  type OptionChoice,
  type OptionGroupView,
} from "@/lib/product-options";

export type TableView = {
  id: string;
  number: number;
  label: string | null;
  seats: number;
  area: string | null;
  active: boolean;
};

export type ComandaView = {
  id: string;
  number: number;
  tableId: string;
  tableName: string;
  customerName: string | null;
  observation: string | null;
  openedAt: string;
  total: number;
  items: {
    id: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
    options: {
      groupName: string;
      optionName: string;
      quantity: number;
      unitPrice: number;
    }[];
  }[];
};

export type ProductView = {
  id: string;
  name: string;
  price: number;
  categoryName: string;
  optionGroups: OptionGroupView[];
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
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function ComandasPanel({
  tables: initialTables,
  comandas: initialComandas,
  products,
  customers,
  canConfirmPayments,
}: {
  tables: TableView[];
  comandas: ComandaView[];
  products: ProductView[];
  customers: { id: string; name: string; phone: string | null }[];
  canConfirmPayments: boolean;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();

  const [tables, setTables] = useState(initialTables);
  const [comandas, setComandas] = useState(initialComandas);
  const [selectedId, setSelectedId] = useState<string | null>(initialComandas[0]?.id ?? null);
  const [openingTable, setOpeningTable] = useState<TableView | null>(null);
  const [openForm, setOpenForm] = useState({
    customerId: "",
    customerName: "",
    observation: "",
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [configuring, setConfiguring] = useState<ProductView | null>(null);
  const [observation, setObservation] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [targetTableId, setTargetTableId] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paidNow, setPaidNow] = useState(canConfirmPayments);
  const [receipt, setReceipt] = useState<{
    orderId: string;
    number: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    setTables(initialTables);
    setComandas(initialComandas);
  }, [initialTables, initialComandas]);

  const selected = comandas.find((c) => c.id === selectedId) ?? null;
  const occupied = useMemo(
    () => new Map(comandas.map((c) => [c.tableId, c])),
    [comandas]
  );
  const categories = useMemo(
    () => ["Todos", ...new Set(products.map((p) => p.categoryName))],
    [products]
  );
  const filteredProducts = useMemo(() => {
    const term = normalize(query.trim());
    return products.filter((product) => {
      if (category !== "Todos" && product.categoryName !== category) return false;
      if (!term) return true;
      return (
        normalize(product.name).includes(term) ||
        normalize(product.categoryName).includes(term)
      );
    });
  }, [products, query, category]);

  useEffect(() => {
    setObservation(selected?.observation ?? "");
    setCart([]);
  }, [selected?.id, selected?.observation]);

  function addItem(product: ProductView, options: OptionChoice[], unitPrice: number) {
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
  }

  function addProduct(product: ProductView) {
    if (product.optionGroups.length > 0) {
      setConfiguring(product);
      return;
    }
    addItem(product, [], product.price);
  }

  function changeCartQuantity(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((item) => (item.key === key ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  function openComanda() {
    if (!openingTable) return;
    startTransition(async () => {
      const result = await openComandaAction({
        tableId: openingTable.id,
        customerId: openForm.customerId || null,
        customerName: openForm.customerName || null,
        observation: openForm.observation || null,
      });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      setOpeningTable(null);
      setOpenForm({ customerId: "", customerName: "", observation: "" });
      setReceipt(null);
      setSelectedId(result.id);
      show("success", `Comanda #${result.number} aberta em ${result.tableLabel}.`);
      router.refresh();
    });
  }

  function addItems() {
    if (!selected) return;
    if (cart.length === 0) {
      show("error", "Adicione produtos antes de salvar.");
      return;
    }
    startTransition(async () => {
      const result = await addComandaItemsAction({
        comandaId: selected.id,
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          options: item.options.map((o) => ({
            groupId: o.groupId,
            optionId: o.optionId,
            quantity: o.quantity,
          })),
        })),
      });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      setCart([]);
      show("success", "Itens adicionados à comanda.");
      router.refresh();
    });
  }

  function changeItemQuantity(itemId: string, quantity: number) {
    startTransition(async () => {
      const result = await setComandaItemQuantityAction({ itemId, quantity });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      router.refresh();
    });
  }

  function saveObservation() {
    if (!selected) return;
    startTransition(async () => {
      const result = await setComandaObservationAction(selected.id, observation);
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      show("success", "Observação salva.");
      router.refresh();
    });
  }

  function transfer() {
    if (!selected || !targetTableId) return;
    startTransition(async () => {
      const result = await transferComandaAction({
        comandaId: selected.id,
        tableId: targetTableId,
      });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      setTransferOpen(false);
      show("success", "Comanda transferida.");
      router.refresh();
    });
  }

  function cancel() {
    if (!selected) return;
    startTransition(async () => {
      const result = await cancelComandaAction(selected.id);
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      setSelectedId(null);
      show("success", "Comanda cancelada.");
      router.refresh();
    });
  }

  function close() {
    if (!selected) return;
    startTransition(async () => {
      const result = await closeComandaAction({
        comandaId: selected.id,
        paymentMethod,
        paidNow,
      });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      setCloseOpen(false);
      setReceipt({
        orderId: result.orderId,
        number: result.orderNumber,
        total: result.total,
      });
      setSelectedId(null);
      show("success", `Comanda fechada — pedido #${result.orderNumber} criado.`);
      router.refresh();
    });
  }

  const cartSubtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <UtensilsCrossed className="h-6 w-6 text-brand-600" /> Comandas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Abra uma comanda por mesa, adicione itens e feche quando o cliente terminar.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/mesas"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            <LayoutGrid className="h-4 w-4" /> Mesas
          </Link>
          <Link
            href="/admin/pdv"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            Ir para o PDV
          </Link>
        </div>
      </div>

      {receipt && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="h-5 w-5" />
              </span>
              <div>
                <p className="font-bold">Comanda fechada — pedido #{String(receipt.number).padStart(4, "0")}</p>
                <p className="text-sm text-muted-foreground">{formatCurrency(receipt.total)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/recibo/${receipt.orderId}`}
                target="_blank"
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Printer className="h-4 w-4" /> Imprimir recibo
              </Link>
              <Button size="sm" variant="ghost" onClick={() => setReceipt(null)}>
                <X className="h-4 w-4" /> Fechar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* Mesas */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Mesas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
              {tables
                .slice()
                .sort((a, b) => a.number - b.number)
                .map((table) => {
                  const comanda = occupied.get(table.id);
                  const isSelected = selected?.id === comanda?.id;
                  return (
                    <button
                      key={table.id}
                      type="button"
                      disabled={!table.active}
                      onClick={() => {
                        if (comanda) {
                          setSelectedId(comanda.id);
                          setReceipt(null);
                        } else {
                          setOpeningTable(table);
                          setOpenForm({ customerId: "", customerName: "", observation: "" });
                        }
                      }}
                      className={cn(
                        "min-h-[88px] rounded-xl border p-3 text-left transition-colors",
                        !table.active && "cursor-not-allowed opacity-50",
                        isSelected
                          ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                          : comanda
                            ? "border-success/30 bg-success/5 hover:bg-success/10"
                            : "border-border bg-background hover:border-brand-400 hover:bg-brand-50"
                      )}
                    >
                      <span className="block text-sm font-bold">
                        {table.label || `Mesa ${table.number}`}
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {table.area || "Salão"} · {table.seats} lugares
                      </span>
                      <span
                        className={cn(
                          "mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          !table.active
                            ? "bg-muted text-muted-foreground"
                            : comanda
                              ? "bg-success/15 text-success"
                              : "bg-brand-50 text-brand-700"
                        )}
                      >
                        {!table.active
                          ? "Inativa"
                          : comanda
                            ? `Comanda #${comanda.number}`
                            : "Livre — abrir"}
                      </span>
                    </button>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* Comanda selecionada */}
        <div className="space-y-4">
          {!selected ? (
            <Card>
              <CardContent className="py-16 text-center">
                <ReceiptIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-semibold">Selecione uma mesa ocupada</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Clique em uma mesa livre para abrir uma comanda.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
                  <div>
                    <CardTitle className="text-lg">
                      Comanda #{String(selected.number).padStart(4, "0")} · {selected.tableName}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Aberta às {formatTime(selected.openedAt)}
                      {selected.customerName ? ` · ${selected.customerName}` : " · Sem cliente"}
                    </p>
                  </div>
                  <span className="text-xl font-extrabold text-brand-700">
                    {formatCurrency(selected.total)}
                  </span>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selected.items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      Nenhum item ainda. Escolha produtos abaixo.
                    </p>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {selected.items.map((item) => (
                        <div key={item.id} className="rounded-xl border border-border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">{item.productName}</p>
                              {item.options.length > 0 && (
                                <p className="text-[11px] text-brand-700">
                                  {describeOptions(item.options)}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {formatCurrency(item.unitPrice)} / un.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => changeItemQuantity(item.id, 0)}
                              className="text-muted-foreground hover:text-danger"
                              aria-label="Remover item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => changeItemQuantity(item.id, Math.max(0, item.quantity - 1))}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => changeItemQuantity(item.id, item.quantity + 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <span className="font-bold">{formatCurrency(item.subtotal)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <Label htmlFor="comanda-observation">Observação da comanda</Label>
                    <div className="flex gap-2">
                      <Textarea
                        id="comanda-observation"
                        value={observation}
                        onChange={(e) => setObservation(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="Ex.: cliente alérgico, trocar acompanhamento..."
                      />
                      <Button variant="outline" onClick={saveObservation} disabled={pending}>
                        Salvar
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    <Button variant="outline" onClick={() => setTransferOpen(true)}>
                      <ArrowRightLeft className="h-4 w-4" /> Transferir
                    </Button>
                    <Button variant="danger" onClick={cancel} disabled={pending}>
                      <X className="h-4 w-4" /> Cancelar comanda
                    </Button>
                    <Button
                      className="ml-auto"
                      onClick={() => {
                        setPaymentMethod("CASH");
                        setPaidNow(canConfirmPayments);
                        setCloseOpen(true);
                      }}
                      disabled={pending || selected.items.length === 0}
                    >
                      <Check className="h-4 w-4" /> Fechar comanda
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Adicionar itens</CardTitle>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar produto..."
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
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addProduct(product)}
                        className="flex min-h-[80px] flex-col justify-between rounded-xl border border-border p-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
                      >
                        <span className="line-clamp-2 text-sm font-semibold">{product.name}</span>
                        <span className="mt-1 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{product.categoryName}</span>
                          <span className="font-bold text-brand-700">{formatCurrency(product.price)}</span>
                        </span>
                        {product.optionGroups.length > 0 && (
                          <span className="text-[10px] font-medium text-brand-700">Montar ▸</span>
                        )}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {cart.length > 0 && (
                <Card className="border-brand-300">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShoppingCart className="h-4 w-4 text-brand-600" /> Itens para adicionar
                    </CardTitle>
                    <Button size="sm" variant="ghost" onClick={() => setCart([])}>
                      Limpar
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {cart.map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-2 rounded-xl border border-border p-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{item.name}</p>
                          {item.options.length > 0 && (
                            <p className="truncate text-[11px] text-brand-700">{describeOptions(item.options)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => changeCartQuantity(item.key, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-5 text-center text-sm font-bold">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => changeCartQuantity(item.key, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t border-border pt-2">
                      <span className="text-sm text-muted-foreground">{formatCurrency(cartSubtotal)}</span>
                      <Button onClick={addItems} disabled={pending}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Adicionar à comanda
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {configuring && (
        <ProductConfigurator
          product={configuring}
          groups={configuring.optionGroups}
          onAdd={(choices, unitPrice) => {
            addItem(configuring, choices, unitPrice);
            setConfiguring(null);
          }}
          onClose={() => setConfiguring(null)}
        />
      )}

      {openingTable && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-bold">
                Abrir comanda — {openingTable.label || `Mesa ${openingTable.number}`}
              </h2>
              <button
                type="button"
                onClick={() => setOpeningTable(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <Label htmlFor="comanda-customer">Cliente (opcional)</Label>
                <select
                  id="comanda-customer"
                  value={openForm.customerId}
                  onChange={(e) =>
                    setOpenForm({
                      ...openForm,
                      customerId: e.target.value,
                      customerName: customers.find((c) => c.id === e.target.value)?.name ?? "",
                    })
                  }
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="">Sem cliente</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.phone ? ` · ${customer.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="comanda-customer-name">Ou nome do cliente (opcional)</Label>
                <Input
                  id="comanda-customer-name"
                  value={openForm.customerName}
                  onChange={(e) =>
                    setOpenForm({ ...openForm, customerName: e.target.value, customerId: "" })
                  }
                  placeholder="Ex.: Sr. João"
                  maxLength={120}
                />
              </div>
              <div>
                <Label htmlFor="comanda-open-observation">Observação (opcional)</Label>
                <Textarea
                  id="comanda-open-observation"
                  value={openForm.observation}
                  onChange={(e) => setOpenForm({ ...openForm, observation: e.target.value })}
                  rows={2}
                  maxLength={500}
                />
              </div>
              <Button className="w-full" size="lg" onClick={openComanda} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Abrir comanda
              </Button>
            </div>
          </div>
        </div>
      )}

      {transferOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-background p-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Transferir comanda</h2>
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Label htmlFor="transfer-table">Mesa de destino</Label>
            <select
              id="transfer-table"
              value={targetTableId}
              onChange={(e) => setTargetTableId(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">Selecione...</option>
              {tables
                .filter((t) => t.active && t.id !== selected.tableId && !occupied.has(t.id))
                .map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.label || `Mesa ${table.number}`}
                  </option>
                ))}
            </select>
            <Button className="mt-4 w-full" onClick={transfer} disabled={pending || !targetTableId}>
              Confirmar transferência
            </Button>
          </div>
        </div>
      )}

      {closeOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-background p-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Fechar comanda #{String(selected.number).padStart(4, "0")}</h2>
              <button
                type="button"
                onClick={() => setCloseOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Total da comanda: <strong className="text-foreground">{formatCurrency(selected.total)}</strong>.
              O fechamento cria o pedido e libera a mesa.
            </p>
            <Label>Forma de pagamento</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PAYMENTS.map((payment) => (
                <button
                  key={payment.value}
                  type="button"
                  onClick={() => setPaymentMethod(payment.value)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium",
                    paymentMethod === payment.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {payment.icon} {payment.label}
                </button>
              ))}
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3">
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
                  {canConfirmPayments
                    ? "Registra entrada no caixa e pedido como pago."
                    : "Peça ao caixa para registrar o recebimento."}
                </span>
              </span>
            </label>
            <Button className="mt-4 w-full" size="lg" onClick={close} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Fechar e gerar pedido
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
