"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  Clock,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Pause,
  Send,
  Trash2,
  Users,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTime } from "@/lib/format";
import { normalizePhone } from "@/lib/whatsapp";
import {
  createCampaignAction,
  sendCampaignAction,
  cancelCampaignAction,
  deleteCampaignAction,
} from "@/app/actions/messages";
import { prisma } from "@/lib/prisma";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type Campaign = {
  id: string;
  title: string;
  message: string;
  status: string;
  total: number;
  sentCount: number;
  errorCount: number;
  cancelledAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  createdBy: { name: string } | null;
  _count: { recipients: number };
};

type Recipient = {
  id: string;
  name: string;
  phone: string;
  status: string;
  error: string | null;
  sentAt: string | null;
};

type Props = {
  customers: Customer[];
  campaigns: Campaign[];
};

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition",
        active ? "bg-brand-100 text-brand-700" : "text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

function replacePreview(text: string, name: string | null) {
  const first = (name || "Cliente").trim().split(/\s+/)[0] || "Cliente";
  return text.replace(/{nome}/gi, first);
}

export function MessagesPanel({ customers, campaigns }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [tab, setTab] = useState<"new" | "history">("new");
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState(
    "Olá, {nome}!\n\nTem novidades na Delícias das Estações. Confira nosso cardápio e aproveite!\n\n— Delícias das Estações"
  );
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [checkingEvolution, setCheckingEvolution] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers.filter((c) => {
      if (!c.phone) return false;
      const norm = normalizePhone(c.phone);
      if (!norm) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.phone || "").replace(/\D/g, "").includes(q.replace(/\D/g, ""));
    });
  }, [customers, search]);

  const allSelected = filtered.length > 0 && filtered.every((c) => selected[c.id]);
  // const someSelected = filtered.some((c) => selected[c.id]) && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      const copy = { ...selected };
      for (const c of filtered) delete copy[c.id];
      setSelected(copy);
    } else {
      const copy = { ...selected };
      for (const c of filtered) copy[c.id] = true;
      setSelected(copy);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedList = useMemo(() => {
    return filtered
      .filter((c) => selected[c.id] && c.phone)
      .map((c) => ({ customerId: c.id, name: c.name, phone: c.phone as string }));
  }, [filtered, selected]);

  const previewName = selectedList[0]?.name || null;

  const create = () => {
    if (selectedList.length === 0) {
      show("error", "Selecione pelo menos um cliente com telefone.");
      return;
    }
    if (title.trim().length < 2) {
      show("error", "Informe o título da campanha.");
      return;
    }
    if (message.trim().length < 5) {
      show("error", "Escreva a mensagem.");
      return;
    }
    startTransition(async () => {
      const res = await createCampaignAction({
        title: title.trim(),
        message: message.trim(),
        recipients: selectedList,
      });
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      show("success", `Campanha criada: ${res.total} destinatário(s).`);
      setSelected({});
      router.refresh();
    });
  };

  const send = (id: string) => {
    setSendingId(id);
    startTransition(async () => {
      const res = await sendCampaignAction(id);
      setSendingId(null);
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      show("success", "Disparo iniciado/atualizado.");
      router.refresh();
    });
  };

  const checkEvolution = async () => {
    setCheckingEvolution(true);
    try {
      const res = await fetch("/api/admin/evolution-status", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        show("error", `Evolution API: ${data?.error ?? "erro"}`);
        return;
      }
      if (!data.configured) {
        show("error", "Evolution API não configurada. Defina EVOLUTION_API_URL/KEY/INSTANCE no .env.");
        return;
      }
      const ph = data.phoneNumber ? `, telefone ${data.phoneNumber}` : "";
      show(
        "success",
        `Evolution API OK · instância "${data.instance}" · estado: ${data.status}${ph}`
      );
    } catch (e) {
      show("error", e instanceof Error ? e.message : "Falha de rede");
    } finally {
      setCheckingEvolution(false);
    }
  };

  const cancel = (id: string) => {
    setCancellingId(id);
    startTransition(async () => {
      const res = await cancelCampaignAction(id);
      setCancellingId(null);
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      show("success", "Campanha cancelada.");
      router.refresh();
    });
  };

  const del = (id: string) => {
    if (!confirm("Excluir esta campanha e seu histórico?")) return;
    setDeletingId(id);
    startTransition(async () => {
      const res = await deleteCampaignAction(id);
      setDeletingId(null);
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      show("success", "Campanha excluída.");
      router.refresh();
    });
  };

  const openDetails = async (id: string) => {
    setDetailId(id);
    setLoadingRecs(true);
    const items = await prisma.campaignRecipient.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, phone: true, status: true, error: true, sentAt: true },
    });
    setRecipients(JSON.parse(JSON.stringify(items)) as Recipient[]);
    setLoadingRecs(false);
  };

  const insertVar = () => {
    setMessage((prev) => (prev ? `${prev} {nome}` : "{nome}"));
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case "COMPLETED":
        return <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Concluída</Badge>;
      case "SENDING":
        return <Badge tone="info"><Loader2 className="h-3 w-3 animate-spin" /> Enviando</Badge>;
      case "CANCELLED":
        return <Badge tone="default"><XCircle className="h-3 w-3" /> Cancelada</Badge>;
      case "FAILED":
        return <Badge tone="danger"><XCircle className="h-3 w-3" /> Falha</Badge>;
      default:
        return <Badge tone="default"><Clock className="h-3 w-3" /> Rascunho</Badge>;
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Disparo de Mensagens</h1>
          <p className="text-sm text-muted-foreground">Envio em massa via Evolution API com variáveis, prévia e histórico.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={checkEvolution} disabled={checkingEvolution}>
            {checkingEvolution ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Testar Evolution API
          </Button>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
            <TabButton active={tab === "new"} onClick={() => setTab("new")}>
              <MessageCircle className="h-4 w-4" /> Novo disparo
            </TabButton>
            <TabButton active={tab === "history"} onClick={() => setTab("history")}>
              <MessagesSquare className="h-4 w-4" /> Histórico
            </TabButton>
          </div>
        </div>
      </div>

      {tab === "new" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-brand-600" /> Selecionar clientes</CardTitle>
              <p className="text-xs text-muted-foreground">Apenas clientes com telefone válido aparecem.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone" className="h-9 max-w-xs" />
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-brand-600" />
                  Selecionar todos ({filtered.length})
                </label>
                <Badge tone="brand">{selectedList.length} selecionado(s)</Badge>
              </div>
              <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card/95">
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="w-8 py-1.5 pl-3" />
                      <th className="py-1.5 pr-3 font-medium">Nome</th>
                      <th className="py-1.5 pr-3 font-medium">Telefone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                        <td className="py-1.5 pl-3">
                          <input type="checkbox" checked={!!selected[c.id]} onChange={() => toggle(c.id)} className="accent-brand-600" />
                        </td>
                        <td className="py-1.5 pr-3">{c.name}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs">{c.phone}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Nenhum cliente encontrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-brand-600" /> Mensagem</CardTitle>
              <p className="text-xs text-muted-foreground">Use {`{nome}`} para personalizar (primeiro nome).</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="title">Título da campanha *</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Promoção de fim de semana" className="h-9" maxLength={120} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="msg">Texto *</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={insertVar}>Inserir {"{nome}"}</Button>
                </div>
                <Textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[160px]" maxLength={2000} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Prévia</p>
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{replacePreview(message, previewName)}</div>
              </div>
              <Button onClick={create} disabled={isPending || selectedList.length === 0} className="gap-2">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Criar campanha e preparar envio
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "history" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessagesSquare className="h-4 w-4 text-brand-600" /> Histórico de disparos</CardTitle>
            <p className="text-xs text-muted-foreground">Veja campanhas, envie pendentes, cancele ou exclua.</p>
          </CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <EmptyState icon={<Bell className="h-8 w-8" />} title="Nenhuma campanha" description="Crie seu primeiro disparo na aba Novo disparo." />
            ) : (
              <div className="space-y-3">
                {campaigns.map((c) => (
                  <div key={c.id} className="rounded-xl border border-border">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{c.title}</span>
                          {statusBadge(c.status)}
                          <Badge tone="default">{c._count.recipients} destinatários</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Criada em {formatDateTime(c.createdAt)}{c.createdBy?.name ? ` · ${c.createdBy.name}` : ""}
                          {c.finishedAt ? ` · Finalizada ${formatDateTime(c.finishedAt)}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Enviados: {c.sentCount} · Erros: {c.errorCount} · Total: {c.total}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => openDetails(c.id)} disabled={loadingRecs && detailId === c.id}>
                          {loadingRecs && detailId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Destinatários
                        </Button>
                        {(c.status === "DRAFT" || c.status === "SENDING") && (
                          <Button size="sm" onClick={() => send(c.id)} disabled={sendingId === c.id}>
                            {sendingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Enviar
                          </Button>
                        )}
                        {(c.status === "DRAFT" || c.status === "SENDING") && (
                          <Button size="sm" variant="ghost" onClick={() => cancel(c.id)} disabled={cancellingId === c.id}>
                            {cancellingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />} Cancelar
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => del(c.id)} disabled={deletingId === c.id}>
                          {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Excluir
                        </Button>
                      </div>
                    </div>
                    {detailId === c.id && (
                      <div className="border-t border-border px-4 py-3">
                        <div className="mb-2 text-xs text-muted-foreground">{loadingRecs ? "Carregando..." : `${recipients.length} destinatário(s)`}</div>
                        <div className="max-h-[360px] overflow-auto rounded-xl border border-border">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-card/95">
                              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                                <th className="py-1.5 pl-3 pr-3 font-medium">Nome</th>
                                <th className="py-1.5 pr-3 font-medium">Telefone</th>
                                <th className="py-1.5 pr-3 font-medium">Status</th>
                                <th className="py-1.5 pr-3 font-medium">Erro</th>
                                <th className="py-1.5 pr-3 font-medium">Enviado em</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recipients.map((r) => (
                                <tr key={r.id} className="border-b border-border/50 last:border-0">
                                  <td className="py-1.5 pl-3 pr-3">{r.name}</td>
                                  <td className="py-1.5 pr-3 font-mono text-xs">{r.phone}</td>
                                  <td className="py-1.5 pr-3">
                                    {r.status === "SENT" && <Badge tone="success">Enviado</Badge>}
                                    {r.status === "ERROR" && <Badge tone="danger">Erro</Badge>}
                                    {r.status === "CANCELLED" && <Badge tone="default">Cancelado</Badge>}
                                    {r.status === "PENDING" && <Badge tone="default">Pendente</Badge>}
                                  </td>
                                  <td className="py-1.5 pr-3 text-xs text-danger">{r.error || "—"}</td>
                                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">{r.sentAt ? formatDateTime(r.sentAt) : "—"}</td>
                                </tr>
                              ))}
                              {!loadingRecs && recipients.length === 0 && (
                                <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Sem destinatários</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
