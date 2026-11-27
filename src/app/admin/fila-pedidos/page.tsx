import type { Metadata } from "next";
import { OrdersOperationsBoard } from "@/components/admin/orders-operations-board";
import { auth } from "@/lib/auth";
import { getOperationsOrders } from "@/lib/orders-feed";
import { getStoreContext } from "@/lib/store-status";
import { can, type SessionUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fila de entregas" };

export default async function DeliveryQueuePage() {
  const [orders, context, session] = await Promise.all([
    getOperationsOrders(),
    getStoreContext(),
    auth(),
  ]);

  const user: SessionUser | null = session?.user
    ? {
        id: session.user.id,
        userType: session.user.userType,
        role: session.user.role ?? null,
        name: session.user.name,
        email: session.user.email,
      }
    : null;

  return (
    <OrdersOperationsBoard
      orders={JSON.parse(JSON.stringify(orders))}
      storeName={context.settings.storeName}
      prepTimeMinutes={context.settings.prepTimeMinutes || 30}
      canConfirm={can(user, "orders.manage") || can(user, "orders.prepare")}
      canDeliver={can(user, "orders.pickup") || can(user, "orders.manage")}
    />
  );
}
