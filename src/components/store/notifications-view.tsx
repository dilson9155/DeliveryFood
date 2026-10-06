"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ShoppingBag, Clock, Wifi } from "lucide-react";
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

export function NotificationsView({ items: initial }: { items: Item[] }) {
  const router = useRouter();
  const { show } = useToast();
  const [, startTransition] = useTransition();
  const [items, setItems] = useState(initial);

  const unread = items.filter((i) => !i.readAt).length;

  function markRead(id: string) {
    startTransition(async () => {
      const res = await markNotificationReadAction(id);
      if (res.ok) {
        setItems((xs) =>
          xs.map((x) => (x.id === id ? { ...x, readAt: new Date().toISOString() } : x))
        );
      } else show("error", res.error);
    });
  }

  function markAll() {
    startTransition(async () => {
      const res = await markAllNotificationsReadAction();
      if (res.ok) {
        setItems((xs) =>
          xs.map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() }))
        );
      } else show("error", res.error);
    });
  }

  function open(item: Item) {
    if (!item.readAt) markRead(item.id);
    if (item.link) router.push(item.link);
  }

  return (
    <div className="container-store py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Notificações</h1>
          <p className="text-sm text-muted-foreground">
            {unread} não lida(s)
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={markAll} disabled={unread === 0}>
          <CheckCheck className="h-4 w-4" /> Marcar todas como lidas
        </Button>
      </div>

      <Card>
        <CardContent className="p-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
              <Bell className="h-9 w-9" />
              <p className="text-sm">Nenhuma notificação.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => open(item)}
                  className={cn(
                    "flex w-full gap-3 p-3 text-left transition-colors hover:bg-muted/40",
                    !item.readAt && "bg-brand-50/60"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      !item.readAt
                        ? "bg-brand-100 text-brand-700"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {TYPE_ICON[item.type] ?? <Bell className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{item.title}</span>
                      {!item.readAt && (
                        <Badge tone={TYPE_TONE[item.type]}>novo</Badge>
                      )}
                    </span>
                    {item.body && (
                      <span className="block text-sm text-muted-foreground">
                        {item.body}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}