import type { Metadata } from "next";
import { OrdersOperationsBoard } from "@/components/admin/orders-operations-board";
import { auth } from "@/lib/auth";
import { getOperationsOrders } from "@/lib/orders-feed";
import { getStoreContext } from "@/lib/store-status";
import { can, type SessionUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fila de pedidos" };

export default async function OperationsQueuePage() {
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

  const receiptSettings = JSON.parse(
    JSON.stringify({
      storeName: context.settings.storeName,
      logoUrl: context.settings.logoUrl,
      cnpj: context.settings.cnpj,
      phone: context.settings.phone,
      address: context.settings.address,
      number: context.settings.number,
      complement: context.settings.complement,
      neighborhood: context.settings.neighborhood,
      city: context.settings.city,
      state: context.settings.state,
      zipCode: context.settings.zipCode,
      receiptMessage: context.settings.receiptMessage,
      receiptFooter: context.settings.receiptFooter,
      printTemplateId: context.settings.printTemplateId,
    })
  );

  return (
    <OrdersOperationsBoard
      orders={JSON.parse(JSON.stringify(orders))}
      settings={receiptSettings}
      storeName={context.settings.storeName}
      prepTimeMinutes={context.settings.prepTimeMinutes || 30}
      canDeliver={can(user, "orders.pickup") || can(user, "orders.manage")}
    />
  );
}
