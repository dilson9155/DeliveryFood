"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  Check,
  CreditCard,
  LayoutGrid,
  List,
  Loader2,
  Minus,
  Plus,
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
  openComandaAction,
  setComandaItemQuantityAction,
  setComandaObservationAction,
  transferComandaAction,
} from "@/app/actions/comandas";
import { cn, formatCurrency, formatTime } from "@/lib/format";
import {
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

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function ComandasPanel({
  tables: initialTables,
  comandas: initialComandas,
  products,
  customers,
}: {
  tables: TableView[];
  comandas: ComandaView[];
  products: ProductView[];
  customers: { id: string; name: string; phone: string | null }[];
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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [showProductList, setShowProductList] = useState(false);
  const [configuring, setConfiguring] = useState<ProductView | null>(null);
  const [observation, setObservation] = useState(initialComandas[0]?.observation ?? "");
  const [transferOpen, setTransferOpen] = useState(false);
  const [targetTableId, setTargetTableId] = useState("");

  useEffect(() => {
    setTables(initialTables);
    setComandas(initialComandas);
  }, [initialTables, initialComandas]);

  const selected = comandas.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    setObservation(selected?.observation ?? "");
  }, [selected?.id]);

  const occupied = useMemo(
    () => new Map(comandas.map((c) => [c.tableId, c])),
    [comandas]
  );
  const categories = useMemo(
    () => ["Todos", ...new Set(products.map((p) => p.categoryName))],
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
          normalize(product.name).includes(term) ||
          normalize(product.categoryName).includes(term)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [products, term, category, showProductList]);

  function toggleProductList(checked: boolean) {
    setShowProductList(checked);
    if (!checked) setCategory("Todos");
  }

  function addProductToComanda(product: ProductView, options: OptionChoice[]) {
    if (!selected || pending) return;
    startTransition(async () => {
      const result = await addComandaItemsAction({
        comandaId: selected.id,
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
        return;
      }
      show("success", `${product.name} adicionado.`);
      setQuery("");
      router.refresh();
    });
  }

  function addProduct(product: ProductView) {
    if (product.optionGroups.length > 0) {
      setConfiguring(product);
      return;
    }
    addProductToComanda(product, []);
  }

  function changeItemQuantity(itemId: string, quantity: number) {
    if (pending) return;
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
      setSelectedId(result.id);
      show("success", `Comanda #${result.number} aberta em ${result.tableLabel}.`);
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <UtensilsCrossed className="h-5 w-5 text-brand-600" /> Comandas
          </h1>
          <p className="text-xs text-muted-foreground">
            Adicione com um clique, ajuste na tabela e feche no PDV com troco.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/mesas"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted"
          >
            <LayoutGrid className="h-4 w-4" /> Mesas
          </Link>
          <Link
            href="/admin/pdv"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted"
          >
            <CreditCard className="h-4 w-4" /> PDV
          </Link>
        </div>
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[270px_minmax(0,1fr)]">
        {/* Mesas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Mesas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-2">
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
                        if (comanda) setSelectedId(comanda.id);
                        else {
                          setOpeningTable(table);
                          setOpenForm({ customerId: "", customerName: "", observation: "" });
                        }
                      }}
                      className={cn(
                        "min-h-[58px] rounded-lg border p-2 text-left transition-colors",
                        !table.active && "cursor-not-allowed opacity-50",
                        isSelected
                          ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                          : comanda
                            ? "border-success/30 bg-success/5 hover:bg-success/10"
                            : "border-border bg-background hover:border-brand-400 hover:bg-brand-50"
                      )}
                    >
                      <span className="block truncate text-[11px] font-bold">
                        {table.label || `Mesa ${table.number}`}
                      </span>
                      <span
                        className={cn(
                          "mt-1 inline-block max-w-full truncate rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
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
                            ? `#${String(comanda.number).padStart(4, "0")}`
                            : "Livre"}
                      </span>
                    </button>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* Comanda selecionada */}
        <div className="min-w-0 space-y-3">
          {!selected ? (
            <Card>
              <CardContent className="py-10 text-center">
                <ReceiptIcon className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-semibold">Selecione uma mesa ocupada</p>
                <p className="text-xs text-muted-foreground">
                  Clique em uma mesa livre para abrir uma comanda.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
                  <div className="min-w-0">
                    <CardTitle className="text-sm">
                      Comanda #{String(selected.number).padStart(4, "0")} · {selected.tableName}
                    </CardTitle>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {formatTime(selected.openedAt)}
                      {selected.customerName ? ` · ${selected.customerName}` : " · Sem cliente"}
                    </p>
                  </div>
                  <span className="text-lg font-extrabold text-brand-700">
                    {formatCurrency(selected.total)}
                  </span>
                </CardHeader>
                <CardContent className="space-y-2">
                  {selected.items.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                      Nenhum item. Escolha produtos abaixo.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-border">
                      <table className="w-full table-fixed text-xs">
                        <thead className="bg-muted/60 text-[9px] uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="w-[46%] px-2 py-1 text-left font-semibold">Produto</th>
                            <th className="w-24 px-1 py-1 text-center font-semibold">Qtd</th>
                            <th className="w-20 px-1 py-1 text-right font-semibold">Unit.</th>
                            <th className="w-20 px-2 py-1 text-right font-semibold">Total</th>
                            <th className="w-7 py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {selected.items.map((item) => (
                            <tr key={item.id} className="border-t border-border/70">
                              <td className="px-2 py-1 align-middle">
                                <p className="truncate text-[11px] font-semibold leading-tight">
                                  {item.productName}
                                </p>
                                {item.options.length > 0 && (
                                  <p className="truncate text-[9px] text-brand-700">
                                    {describeOptions(item.options)}
                                  </p>
                                )}
                              </td>
                              <td className="px-1 py-1">
                                <div className="flex items-center justify-center gap-0.5">
                                  <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() =>
                                      changeItemQuantity(item.id, Math.max(0, item.quantity - 1))
                                    }
                                    className="flex h-5 w-5 items-center justify-center rounded border border-border disabled:opacity-50"
                                    aria-label={`Diminuir ${item.productName}`}
                                  >
                                    <Minus className="h-2.5 w-2.5" />
                                  </button>
                                  <span className="w-4 text-center text-[11px] font-bold">
                                    {item.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => changeItemQuantity(item.id, item.quantity + 1)}
                                    className="flex h-5 w-5 items-center justify-center rounded border border-border disabled:opacity-50"
                                    aria-label={`Aumentar ${item.productName}`}
                                  >
                                    <Plus className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              </td>
                              <td className="px-1 py-1 text-right text-[10px] text-muted-foreground">
                                {formatCurrency(item.unitPrice)}
                              </td>
                              <td className="px-2 py-1 text-right text-[11px] font-bold">
                                {formatCurrency(item.subtotal)}
                              </td>
                              <td className="py-1 text-center">
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => changeItemQuantity(item.id, 0)}
                                  className="text-muted-foreground hover:text-danger disabled:opacity-50"
                                  aria-label={`Remover ${item.productName}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[180px] flex-1">
                      <Label htmlFor="comanda-observation" className="text-[10px]">
                        Observação
                      </Label>
                      <Input
                        id="comanda-observation"
                        value={observation}
                        onChange={(e) => setObservation(e.target.value)}
                        placeholder="Ex.: sem cebola, alérgico..."
                        className="h-9 text-xs"
                        maxLength={500}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={saveObservation}
                      disabled={pending}
                      className="h-9"
                    >
                      Salvar
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTransferOpen(true)}
                      disabled={pending}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" /> Transferir
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={cancel}
                      disabled={pending}
                    >
                      <X className="h-3.5 w-3.5" /> Cancelar
                    </Button>
                    {selected.items.length > 0 ? (
                      <Link
                        href={`/admin/pdv?comanda=${selected.id}`}
                        className="ml-auto inline-flex h-8 items-center gap-2 rounded-xl bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700"
                        title="Pagamento e troco no PDV"
                      >
                        <Check className="h-3.5 w-3.5" /> Fechar comanda
                      </Link>
                    ) : (
                      <Button size="sm" className="ml-auto" disabled title="Adicione itens para fechar">
                        <Check className="h-3.5 w-3.5" /> Fechar comanda
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="gap-1.5 pb-2">
                  <CardTitle className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-brand-600" /> Adicionar itens
                    </span>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
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
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Digite o nome do produto..."
                      className="h-9 pl-9 text-xs"
                    />
                  </div>
                  {showProductList && (
                    <div className="flex flex-wrap gap-1">
                      {categories.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setCategory(item)}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
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
                    <p className="rounded-lg border border-dashed border-border py-3 text-center text-xs text-muted-foreground">
                      {term
                        ? "Nenhum produto encontrado."
                        : "Digite para buscar ou marque Listar produtos."}
                    </p>
                  ) : (
                    <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {visibleProducts.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          disabled={pending}
                          onClick={() => addProduct(product)}
                          className="flex min-h-[56px] flex-col justify-between rounded-lg border border-border p-2 text-left transition-colors hover:border-brand-500 hover:bg-brand-50 disabled:opacity-60"
                        >
                          <span className="line-clamp-2 text-[11px] font-semibold leading-tight">
                            {product.name}
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-1 text-[10px]">
                            <span className="truncate text-muted-foreground">{product.categoryName}</span>
                            <span className="shrink-0 font-bold text-brand-700">
                              {formatCurrency(product.price)}
                            </span>
                          </span>
                          {product.optionGroups.length > 0 && (
                            <span className="text-[9px] font-medium text-brand-700">Montar ▸</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {configuring && (
        <ProductConfigurator
          product={configuring}
          groups={configuring.optionGroups}
          onAdd={(choices) => {
            addProductToComanda(configuring, choices);
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
    </div>
  );
}
