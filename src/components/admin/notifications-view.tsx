"use client";

import { useState, useTransition } from "react";
import { Bell, CheckCheck, ShoppingBag, Wifi, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, cn } from "@/lib/format";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/app/actions/notifications";

type Item = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  NEW_ORDER: <ShoppingBag className="h-4 w-4" />,
  ORDER_STATUS: <Clock className="h-4 w-4" />,
  PAYMENT: <Wifi className="h-4 w-4" />,
};

const TYPE_TONE: Record<string, "danger" | "info" | "success"> = {
  NEW_ORDER: "danger",
  ORDER_STATUS: "info",
  PAYMENT: "success",
};

export function NotificationsView({
  items: initial,
  total,
  hasMore,
}: {
  items: Item[];
  total: number;
  hasMore: boolean;
}) {
  const { show } = useToast();
  const [, startTransition] = useTransition();
  const [items, setItems] = useState(initial);
  const [loading, setLoading] = useState(false);

  const unread = items.filter((i) => !i.readAt).length;

  function markRead(id: string) {
    startTransition(async () => {
      const res = await markNotificationReadAction(id);
      if (res.ok) {
        setItems((xs) => xs.map((x) => (x.id === id ? { ...x, readAt: new Date().toISOString() } : x)));
      } else show("error", res.error);
    });
  }

  function markAll() {
    startTransition(async () => {
      const res = await markAllNotificationsReadAction();
      if (res.ok) {
        setItems((xs) => xs.map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() })));
      } else show("error", res.error);
    });
  }

  function loadMore() {
    setLoading(true);
    fetch(`/api/admin/notifications?cursor=${items[items.length - 1]?.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setItems((xs) => [...xs, ...d.items]);
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Notificações</h1>
          <p className="text-sm text-muted-foreground">
            {unread} não lida(s) · {items.length} de {total} no total
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={markAll} disabled={unread === 0}>
          <CheckCheck className="h-4 w-4" /> Marcar todas como lidas
        </Button>
      </div>

      <Card>
        <CardContent className="p-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Bell className="h-8 w-8" />
              <p className="text-sm">Nenhuma notificação.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex gap-3 p-3 transition-colors hover:bg-muted/40",
                    !item.readAt && "bg-brand-50/60"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      !item.readAt ? "bg-brand-100 text-brand-700" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {TYPE_ICON[item.type] ?? <Bell className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      {!item.readAt && <Badge tone={TYPE_TONE[item.type]}>novo</Badge>}
                    </div>
                    {item.body && (
                      <p className="text-sm text-muted-foreground">{item.body}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                  {!item.readAt && (
                    <button
                      onClick={() => markRead(item.id)}
                      className="shrink-0 text-xs font-medium text-brand-700 hover:underline"
                    >
                      Marcar como lida
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {hasMore && (
        <div className="text-center">
          <Button variant="ghost" onClick={loadMore} disabled={loading}>
            {loading ? "Carregando..." : "Carregar mais"}
          </Button>
        </div>
      )}
    </div>
  );
}