import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreContext } from "@/lib/store-status";
import { UserType } from "@prisma/client";
import { Receipt } from "@/components/store/receipt";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recibo" };

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const [order, context] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, phone: true } },
        items: { orderBy: { id: "asc" } },
        history: { orderBy: { createdAt: "asc" } },
        payment: true,
      },
    }),
    getStoreContext(),
  ]);

  if (!order) notFound();

  const isOwner =
    session?.user?.id === order.customerId &&
    session.user.userType === UserType.CUSTOMER;
  const isEmployee = session?.user?.userType === UserType.EMPLOYEE;
  if (!isOwner && !isEmployee) {
    notFound();
  }

  return (
    <Receipt
      order={JSON.parse(JSON.stringify(order))}
      settings={JSON.parse(JSON.stringify({
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
      }))}
    />
  );
}