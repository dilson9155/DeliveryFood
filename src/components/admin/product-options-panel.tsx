"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, Pencil, Layers, ListChecks, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/format";
import {
  deleteOptionGroupAction,
  deleteProductOptionAction,
  saveOptionGroupAction,
  saveProductOptionAction,
} from "@/app/actions/product-options";

type OptionView = {
  id: string;
  name: string;
  price: number;
  order: number;
  active: boolean;
};

type GroupView = {
  id: string;
  name: string;
  description: string | null;
  minQuantity: number;
  maxQuantity: number;
  required: boolean;
  order: number;
  active: boolean;
  options: OptionView[];
};

type OptionDraft = {
  id?: string;
  name: string;
  price: string;
  order: string;
  active: boolean;
};

const emptyOption = (): OptionDraft => ({ name: "", price: "0", order: "0", active: true });

export function ProductOptionsPanel({
  product,
  groups,
}: {
  product: { id: string; name: string; price: number };
  groups: GroupView[];
}) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: "",
    description: "",
    minQuantity: "1",
    maxQuantity: "1",
    required: true,
    order: "0",
    active: true,
  });

  function createGroup() {
    if (!form.name.trim()) {
      show("error", "Informe o nome do grupo.");
      return;
    }
    start(async () => {
      const res = await saveOptionGroupAction({
        productId: product.id,
        name: form.name,
        description: form.description || null,
        minQuantity: Number(form.minQuantity),
        maxQuantity: Number(form.maxQuantity),
        required: form.required,
        order: Number(form.order) || 0,
        active: form.active,
      });
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      show("success", "Grupo criado.");
      setForm({
        name: "",
        description: "",
        minQuantity: "1",
        maxQuantity: "1",
        required: true,
        order: "0",
        active: true,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Novo grupo de escolhas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="newGroupName">Nome do grupo</Label>
              <Input
                id="newGroupName"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Escolha a carne"
              />
            </div>
            <div>
              <Label htmlFor="newGroupDescription">Descrição</Label>
              <Input
                id="newGroupDescription"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ex.: Escolha até 2 carnes"
              />
            </div>
            <div>
              <Label htmlFor="newGroupOrder">Ordem</Label>
              <Input
                id="newGroupOrder"
                type="number"
                value={form.order}
                onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="newGroupMin">Quantidade mínima</Label>
              <Input
                id="newGroupMin"
                type="number"
                min={1}
                max={99}
                value={form.minQuantity}
                onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="newGroupMax">Quantidade máxima</Label>
              <Input
                id="newGroupMax"
                type="number"
                min={1}
                max={99}
                value={form.maxQuantity}
                onChange={(e) => setForm((f) => ({ ...f, maxQuantity: e.target.value }))}
              />
            </div>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.required}
                  onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))}
                />
                Obrigatório
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Ativo
              </label>
            </div>
          </div>
          <Button onClick={createGroup} disabled={pending}>
            <Plus className="h-4 w-4" /> Criar grupo
          </Button>
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum grupo cadastrado. Crie grupos para permitir que o cliente monte o produto.
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => (
          <GroupCard key={group.id} productId={product.id} group={group} />
        ))
      )}
    </div>
  );
}

function GroupCard({ productId, group }: { productId: string; group: GroupView }) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [groupForm, setGroupForm] = useState({
    name: group.name,
    description: group.description ?? "",
    minQuantity: String(group.minQuantity),
    maxQuantity: String(group.maxQuantity),
    required: group.required,
    order: String(group.order),
    active: group.active,
  });
  const [options, setOptions] = useState<OptionDraft[]>(() => [
    ...group.options.map((o) => ({
      id: o.id,
      name: o.name,
      price: String(o.price),
      order: String(o.order),
      active: o.active,
    })),
    emptyOption(),
  ]);

  function saveGroup() {
    start(async () => {
      const res = await saveOptionGroupAction({
        id: group.id,
        productId,
        name: groupForm.name,
        description: groupForm.description || null,
        minQuantity: Number(groupForm.minQuantity),
        maxQuantity: Number(groupForm.maxQuantity),
        required: groupForm.required,
        order: Number(groupForm.order) || 0,
        active: groupForm.active,
      });
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      show("success", "Grupo atualizado.");
      setEditing(false);
      router.refresh();
    });
  }

  function removeGroup() {
    if (!window.confirm(`Excluir o grupo "${group.name}" e todas as suas opções?`)) return;
    start(async () => {
      const res = await deleteOptionGroupAction(group.id);
      if (!res.ok) show("error", res.error);
      else show("success", "Grupo excluído.");
      router.refresh();
    });
  }

  function saveOptions() {
    start(async () => {
      for (const option of options) {
        if (!option.name.trim()) continue;
        const res = await saveProductOptionAction({
          ...(option.id ? { id: option.id } : {}),
          groupId: group.id,
          name: option.name,
          price: Number(option.price) || 0,
          order: Number(option.order) || 0,
          active: option.active,
        });
        if (!res.ok) {
          show("error", res.error);
          return;
        }
      }
      show("success", "Opções salvas.");
      router.refresh();
    });
  }

  function removeOption(index: number) {
    const option = options[index];
    if (!option.id) {
      setOptions((list) => list.filter((_, i) => i !== index));
      return;
    }
    if (!window.confirm(`Excluir a opção "${option.name}"?`)) return;
    start(async () => {
      const res = await deleteProductOptionAction(option.id!);
      if (!res.ok) show("error", res.error);
      else show("success", "Opção excluída.");
      router.refresh();
    });
  }

  function setOption(index: number, patch: Partial<OptionDraft>) {
    setOptions((list) => list.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-brand-600" />
          {group.name}
          <span className="text-xs font-normal text-muted-foreground">
            {group.minQuantity} a {group.maxQuantity} escolha(s)
            {group.required ? " · obrigatório" : " · opcional"}
            {!group.active && " · inativo"}
          </span>
        </CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
          <Button size="sm" variant="ghost" onClick={removeGroup} disabled={pending}>
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing && (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label>Nome</Label>
                <Input value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={groupForm.description} onChange={(e) => setGroupForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={groupForm.order} onChange={(e) => setGroupForm((f) => ({ ...f, order: e.target.value }))} />
              </div>
              <div>
                <Label>Mínimo</Label>
                <Input type="number" min={1} value={groupForm.minQuantity} onChange={(e) => setGroupForm((f) => ({ ...f, minQuantity: e.target.value }))} />
              </div>
              <div>
                <Label>Máximo</Label>
                <Input type="number" min={1} value={groupForm.maxQuantity} onChange={(e) => setGroupForm((f) => ({ ...f, maxQuantity: e.target.value }))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={groupForm.required} onChange={(e) => setGroupForm((f) => ({ ...f, required: e.target.checked }))} />
                Obrigatório
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={groupForm.active} onChange={(e) => setGroupForm((f) => ({ ...f, active: e.target.checked }))} />
                Ativo
              </label>
            </div>
            <Button size="sm" onClick={saveGroup} disabled={pending}>
              <Save className="h-4 w-4" /> Salvar grupo
            </Button>
          </div>
        )}

        {group.description && <p className="text-xs text-muted-foreground">{group.description}</p>}

        <div className="space-y-2">
          {options.map((option, index) => (
            <div key={option.id ?? `new-${index}`} className="grid items-end gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_100px_70px_auto_auto]">
              <div>
                <Label className="text-xs">Opção</Label>
                <Input
                  className="h-9"
                  value={option.name}
                  onChange={(e) => setOption(index, { name: e.target.value })}
                  placeholder="Ex.: Frango grelhado"
                />
              </div>
              <div>
                <Label className="text-xs">Adicional (R$)</Label>
                <Input
                  className="h-9"
                  type="number"
                  step="0.01"
                  min={0}
                  value={option.price}
                  onChange={(e) => setOption(index, { price: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Ordem</Label>
                <Input
                  className="h-9"
                  type="number"
                  value={option.order}
                  onChange={(e) => setOption(index, { order: e.target.value })}
                />
              </div>
              <label className="flex h-9 items-center gap-1.5 text-xs">
                <input type="checkbox" checked={option.active} onChange={(e) => setOption(index, { active: e.target.checked })} />
                Ativo
              </label>
              <Button size="sm" variant="ghost" onClick={() => removeOption(index)} disabled={pending}>
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOptions((list) => [...list, emptyOption()])}
            >
              <Plus className="h-4 w-4" /> Nova opção
            </Button>
            <Button size="sm" onClick={saveOptions} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar opções
            </Button>
            <span className="text-xs text-muted-foreground">
              {group.options.length} opção(ões) cadastrada(s)
            </span>
          </div>
        </div>
        {group.options.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Valores adicionais: {group.options.filter((o) => o.price > 0).map((o) => `${o.name} +${formatCurrency(o.price)}`).join(", ") || "nenhum"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
