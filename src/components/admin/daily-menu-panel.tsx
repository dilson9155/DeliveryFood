"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  Copy,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  deleteDailyMenuMealAction,
  deleteDailyMenuSizeAction,
  duplicateDailyMenuAction,
  saveDailyMenuAction,
  saveDailyMenuMealAction,
  saveDailyMenuPricesAction,
  saveDailyMenuSizeAction,
  setDailyMenuActiveAction,
  setDailyMenuMealActiveAction,
} from "@/app/actions/daily-menu";
import { menuDateLabel, menuRemainingLabel } from "@/lib/daily-menu";
import { cn, formatCurrency } from "@/lib/format";

type MenuSummary = {
  id: string;
  date: string;
  title: string | null;
  active: boolean;
};

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

type MenuDetail = MenuSummary & { meals: Meal[]; sizes: Size[] };

type Modal = "menu" | "meal" | "size" | "duplicate" | null;

function parseMoney(value: string): number {
  const cleaned = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  return Number(cleaned) || 0;
}

export function DailyMenuPanel({
  date,
  menus,
  menu,
}: {
  date: string;
  menus: MenuSummary[];
  menu: MenuDetail | null;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<Modal>(null);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [editingSize, setEditingSize] = useState<Size | null>(null);
  const [menuTitle, setMenuTitle] = useState(menu?.title ?? "");
  const [menuActive, setMenuActive] = useState(menu?.active ?? true);
  const [mealForm, setMealForm] = useState({
    name: "",
    description: "",
    availableQty: "",
    order: "0",
    active: true,
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [sizeForm, setSizeForm] = useState({
    name: "",
    description: "",
    order: "0",
    active: true,
  });
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [duplicateSource, setDuplicateSource] = useState("");
  const [duplicateDate, setDuplicateDate] = useState(date);

  useEffect(() => {
    setMenuTitle(menu?.title ?? "");
    setMenuActive(menu?.active ?? true);
  }, [menu?.id, menu?.title, menu?.active]);

  useEffect(() => {
    const draft: Record<string, string> = {};
    for (const meal of menu?.meals ?? []) {
      for (const size of menu?.sizes ?? []) {
        const existing = meal.prices.find((price) => price.sizeId === size.id);
        draft[`${meal.id}:${size.id}`] = existing ? String(existing.price) : "";
      }
    }
    setPrices(draft);
  }, [menu]);

  const sortedMenus = useMemo(
    () => [...menus].sort((a, b) => b.date.localeCompare(a.date)),
    [menus]
  );
  const availableMeals = (menu?.meals ?? []).filter((meal) => meal.active);
  const availableSizes = (menu?.sizes ?? []).filter((size) => size.active);

  function goToDate(value: string) {
    router.push(`/admin/cardapio-do-dia?date=${value}`);
  }

  function openMealForm(meal?: Meal) {
    setEditingMeal(meal ?? null);
    setMealForm({
      name: meal?.name ?? "",
      description: meal?.description ?? "",
      availableQty: meal?.availableQty === null || meal?.availableQty === undefined ? "" : String(meal.availableQty),
      order: String(meal?.order ?? 0),
      active: meal?.active ?? true,
    });
    setImageUrl(meal?.imageUrl ?? null);
    setImageError(null);
    setModal("meal");
  }

  function openSizeForm(size?: Size) {
    setEditingSize(size ?? null);
    setSizeForm({
      name: size?.name ?? "",
      description: size?.description ?? "",
      order: String(size?.order ?? 0),
      active: size?.active ?? true,
    });
    setModal("size");
  }

  function handleImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("Escolha um arquivo de imagem.");
      return;
    }
    if (file.size > 512 * 1024) {
      setImageError("A imagem deve ter no máximo 512 KB.");
      return;
    }
    setImageError(null);
    const reader = new FileReader();
    reader.onload = () => setImageUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  function saveMenu() {
    startTransition(async () => {
      const result = await saveDailyMenuAction({
        id: menu?.id,
        date,
        title: menuTitle,
        active: menuActive,
      });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      show("success", "Cardápio salvo.");
      setModal(null);
      router.refresh();
    });
  }

  function saveMeal() {
    if (!menu) return;
    startTransition(async () => {
      const result = await saveDailyMenuMealAction({
        id: editingMeal?.id,
        menuId: menu.id,
        name: mealForm.name,
        description: mealForm.description || null,
        imageUrl,
        availableQty: mealForm.availableQty.trim() === "" ? null : Number(mealForm.availableQty),
        active: mealForm.active,
        order: Number(mealForm.order) || 0,
      });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      show("success", "Refeição salva.");
      setModal(null);
      router.refresh();
    });
  }

  function saveSize() {
    if (!menu) return;
    startTransition(async () => {
      const result = await saveDailyMenuSizeAction({
        id: editingSize?.id,
        menuId: menu.id,
        name: sizeForm.name,
        description: sizeForm.description || null,
        active: sizeForm.active,
        order: Number(sizeForm.order) || 0,
      });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      show("success", "Tamanho salvo.");
      setModal(null);
      router.refresh();
    });
  }

  function saveAllPrices() {
    if (!menu) return;
    startTransition(async () => {
      const payload = (menu.meals ?? []).flatMap((meal) =>
        (menu.sizes ?? []).map((size) => ({
          mealId: meal.id,
          sizeId: size.id,
          price: parseMoney(prices[`${meal.id}:${size.id}`] ?? ""),
        }))
      );
      const result = await saveDailyMenuPricesAction({ menuId: menu.id, prices: payload });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      show("success", "Preços atualizados.");
      router.refresh();
    });
  }

  function duplicate() {
    startTransition(async () => {
      const result = await duplicateDailyMenuAction({
        sourceId: duplicateSource,
        date: duplicateDate,
      });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      show("success", "Cardápio duplicado.");
      setModal(null);
      goToDate(duplicateDate);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Cardápio do dia</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Monte as refeições completas, tamanhos e preços. O cliente escolhe apenas a opção desejada.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-1.5">
            <CalendarDays className="h-4 w-4 text-brand-600" />
            <input
              type="date"
              value={date}
              onChange={(event) => event.target.value && goToDate(event.target.value)}
              className="bg-transparent text-sm font-semibold outline-none"
              aria-label="Data do cardápio"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDuplicateSource(sortedMenus.find((item) => item.id !== menu?.id)?.id ?? "");
              setDuplicateDate(date);
              setModal("duplicate");
            }}
          >
            <Copy className="h-4 w-4" /> Duplicar cardápio
          </Button>
          <Button size="sm" onClick={() => setModal("menu")}>
            {menu ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {menu ? "Editar cardápio" : "Criar cardápio"}
          </Button>
        </div>
      </div>

      <Card className="border-brand-200 bg-gradient-to-r from-brand-50/80 to-background">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <div>
            <CardTitle className="text-base capitalize">
              {menu?.title?.trim() || `Cardápio de ${menuDateLabel(date)}`}
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {menu
                ? `${menu.meals.length} refeição(ões) · ${menu.sizes.length} tamanho(s)`
                : "Nenhum cardápio cadastrado para esta data."}
            </p>
          </div>
          {menu && (
            <Badge tone={menu.active ? "success" : "muted"}>
              {menu.active ? "Ativo para pedidos" : "Encerrado / agendado"}
            </Badge>
          )}
        </CardHeader>
        {menu && (
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={menu.active ? "outline" : "default"}
              onClick={() =>
                startTransition(async () => {
                  const result = await setDailyMenuActiveAction(menu.id, !menu.active);
                  if (!result.ok) show("error", result.error);
                  else {
                    show("success", menu.active ? "Cardápio encerrado." : "Cardápio ativado.");
                    router.refresh();
                  }
                })
              }
              disabled={pending}
            >
              {menu.active ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {menu.active ? "Encerrar vendas" : "Ativar vendas"}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Cardápios futuros podem ficar inativos até o dia da venda.
            </span>
          </CardContent>
        )}
      </Card>

      {!menu ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-semibold">Não há cardápio para {menuDateLabel(date)}.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Crie o cardápio do dia ou duplique um dia anterior.
            </p>
            <Button className="mt-4" onClick={() => setModal("menu")}>
              <Plus className="h-4 w-4" /> Criar cardápio
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm">Refeições completas</CardTitle>
              <Button size="sm" variant="outline" onClick={() => openMealForm()}>
                <Plus className="h-4 w-4" /> Nova refeição
              </Button>
            </CardHeader>
            <CardContent>
              {menu.meals.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  Cadastre as opções de refeição completa (ex.: Frango assado, Bife acebolado).
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {menu.meals.map((meal) => (
                    <div
                      key={meal.id}
                      className={cn(
                        "flex gap-2.5 rounded-xl border p-2.5",
                        meal.active ? "border-border bg-card" : "border-dashed border-border bg-muted/40 opacity-70"
                      )}
                    >
                      {meal.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={meal.imageUrl}
                          alt={meal.name}
                          className="h-16 w-16 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <ImagePlus className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <p className="truncate text-sm font-bold">{meal.name}</p>
                          <div className="flex shrink-0 gap-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                startTransition(async () => {
                                  const result = await setDailyMenuMealActiveAction(meal.id, !meal.active);
                                  if (!result.ok) show("error", result.error);
                                  else router.refresh();
                                })
                              }
                              className="rounded p-1 text-muted-foreground hover:bg-muted"
                              title={meal.active ? "Desativar" : "Ativar"}
                            >
                              <Check className={cn("h-3.5 w-3.5", meal.active ? "text-success" : "")} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openMealForm(meal)}
                              className="rounded p-1 text-muted-foreground hover:bg-muted"
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Remover ${meal.name}?`)) {
                                  startTransition(async () => {
                                    const result = await deleteDailyMenuMealAction(meal.id);
                                    if (!result.ok) show("error", result.error);
                                    else router.refresh();
                                  });
                                }
                              }}
                              className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                              title="Remover"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {meal.description && (
                          <p className="line-clamp-2 text-[11px] text-muted-foreground">{meal.description}</p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <Badge tone={meal.active ? "brand" : "muted"}>
                            {menuRemainingLabel(meal.availableQty)}
                          </Badge>
                          {meal.prices.length > 0 && (
                            <span className="text-[10px] font-semibold text-brand-700">
                              {formatCurrency(Math.min(...meal.prices.map((price) => price.price)))} +
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="max-w-3xl">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm">Tamanhos da marmita</CardTitle>
              <Button size="sm" variant="outline" onClick={() => openSizeForm()}>
                <Plus className="h-4 w-4" /> Novo tamanho
              </Button>
            </CardHeader>
            <CardContent>
              {menu.sizes.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  Cadastre Pequena, Média, Grande e Especial.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {menu.sizes.map((size) => (
                    <div
                      key={size.id}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-2",
                        size.active ? "border-border bg-card" : "border-dashed bg-muted/40 opacity-70"
                      )}
                    >
                      <div>
                        <p className="text-sm font-bold">{size.name}</p>
                        {size.description && (
                          <p className="text-[10px] text-muted-foreground">{size.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openSizeForm(size)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Remover tamanho ${size.name}?`)) {
                            startTransition(async () => {
                              const result = await deleteDailyMenuSizeAction(size.id);
                              if (!result.ok) show("error", result.error);
                              else router.refresh();
                            });
                          }
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="max-w-4xl">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
              <div>
                <CardTitle className="text-sm">Preços por refeição e tamanho</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Um preço diferente para cada tamanho de marmita.
                </p>
              </div>
              <Button
                size="sm"
                onClick={saveAllPrices}
                disabled={pending || menu.meals.length === 0 || menu.sizes.length === 0}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar preços
              </Button>
            </CardHeader>
            <CardContent>
              {menu.sizes.length === 0 || menu.meals.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  Cadastre refeições e tamanhos para definir os preços.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 text-left">Refeição</th>
                        {menu.sizes.map((size) => (
                          <th key={size.id} className="w-32 px-2 py-2 text-center">
                            {size.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {menu.meals.map((meal) => (
                        <tr key={meal.id} className="border-b border-border/70">
                          <td className="py-2 pr-3 text-xs font-semibold">{meal.name}</td>
                          {menu.sizes.map((size) => (
                            <td key={size.id} className="px-2 py-2">
                              <Input
                                inputMode="decimal"
                                placeholder="0,00"
                                value={prices[`${meal.id}:${size.id}`] ?? ""}
                                onChange={(event) =>
                                  setPrices((prev) => ({
                                    ...prev,
                                    [`${meal.id}:${size.id}`]: event.target.value,
                                  }))
                                }
                                className="h-9 text-center text-xs"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {modal === "menu" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-bold">{menu ? "Editar cardápio" : "Criar cardápio"}</h2>
              <button onClick={() => setModal(null)} className="rounded-lg p-1.5 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <Label>Data</Label>
                <Input type="date" value={date} onChange={(event) => setDuplicateDate(event.target.value)} readOnly />
              </div>
              <div>
                <Label>Título (opcional)</Label>
                <Input
                  value={menuTitle}
                  onChange={(event) => setMenuTitle(event.target.value)}
                  placeholder="Ex.: Cardápio de segunda-feira"
                  maxLength={120}
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={menuActive}
                  onChange={(event) => setMenuActive(event.target.checked)}
                  className="h-4 w-4 accent-[#FF9800]"
                />
                Cardápio ativo (visível para pedidos)
              </label>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="outline" onClick={() => setModal(null)}>
                  Cancelar
                </Button>
                <Button onClick={saveMenu} disabled={pending}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal === "meal" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-bold">{editingMeal ? "Editar refeição" : "Nova refeição"}</h2>
              <button onClick={() => setModal(null)} className="rounded-lg p-1.5 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <Label>Nome da refeição completa</Label>
                <Input
                  value={mealForm.name}
                  onChange={(event) => setMealForm({ ...mealForm, name: event.target.value })}
                  placeholder="Ex.: Frango assado com acompanhamentos"
                  maxLength={120}
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={mealForm.description}
                  onChange={(event) => setMealForm({ ...mealForm, description: event.target.value })}
                  placeholder="Ex.: Arroz, feijão, salada e farofa"
                  maxLength={500}
                  className="min-h-[70px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quantidade disponível</Label>
                  <Input
                    type="number"
                    min={0}
                    max={9999}
                    value={mealForm.availableQty}
                    onChange={(event) => setMealForm({ ...mealForm, availableQty: event.target.value })}
                    placeholder="Vazio = sem limite"
                  />
                </div>
                <div>
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    min={0}
                    max={999}
                    value={mealForm.order}
                    onChange={(event) => setMealForm({ ...mealForm, order: event.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Foto da refeição</Label>
                <div className="flex items-center gap-3">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="Prévia" className="h-16 w-16 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <ImagePlus className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
                      <ImagePlus className="h-4 w-4" /> Escolher foto
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => handleImage(event.target.files?.[0])}
                      />
                    </label>
                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => setImageUrl(null)}
                        className="ml-2 text-xs text-danger underline"
                      >
                        Remover
                      </button>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">PNG/JPG até 512 KB.</p>
                  </div>
                </div>
                {imageError && <p className="text-xs text-danger">{imageError}</p>}
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={mealForm.active}
                  onChange={(event) => setMealForm({ ...mealForm, active: event.target.checked })}
                  className="h-4 w-4 accent-[#FF9800]"
                />
                Refeição ativa
              </label>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="outline" onClick={() => setModal(null)}>
                  Cancelar
                </Button>
                <Button onClick={saveMeal} disabled={pending || mealForm.name.trim().length < 2}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal === "size" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-bold">{editingSize ? "Editar tamanho" : "Novo tamanho"}</h2>
              <button onClick={() => setModal(null)} className="rounded-lg p-1.5 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <Label>Nome</Label>
                <Input
                  value={sizeForm.name}
                  onChange={(event) => setSizeForm({ ...sizeForm, name: event.target.value })}
                  placeholder="Ex.: Grande"
                  maxLength={60}
                />
              </div>
              <div>
                <Label>Descrição (opcional)</Label>
                <Input
                  value={sizeForm.description}
                  onChange={(event) => setSizeForm({ ...sizeForm, description: event.target.value })}
                  placeholder="Ex.: serve 2 pessoas"
                  maxLength={200}
                />
              </div>
              <div>
                <Label>Ordem</Label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  value={sizeForm.order}
                  onChange={(event) => setSizeForm({ ...sizeForm, order: event.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={sizeForm.active}
                  onChange={(event) => setSizeForm({ ...sizeForm, active: event.target.checked })}
                  className="h-4 w-4 accent-[#FF9800]"
                />
                Tamanho ativo
              </label>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="outline" onClick={() => setModal(null)}>
                  Cancelar
                </Button>
                <Button onClick={saveSize} disabled={pending || sizeForm.name.trim().length < 2}>
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal === "duplicate" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-background p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Duplicar cardápio</h2>
              <button onClick={() => setModal(null)} className="rounded-lg p-1.5 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <Label>Cardápio de origem</Label>
                <select
                  value={duplicateSource}
                  onChange={(event) => setDuplicateSource(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                >
                  <option value="">Selecione...</option>
                  {sortedMenus.map((item) => (
                    <option key={item.id} value={item.id} disabled={item.id === menu?.id}>
                      {item.date} {item.title ? `— ${item.title}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Data de destino</Label>
                <Input
                  type="date"
                  value={duplicateDate}
                  onChange={(event) => setDuplicateDate(event.target.value)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Refeições, fotos, descrições, tamanhos, preços e quantidades serão copiados.
              </p>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="outline" onClick={() => setModal(null)}>
                  Cancelar
                </Button>
                <Button onClick={duplicate} disabled={pending || !duplicateSource || !duplicateDate}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                  Duplicar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
