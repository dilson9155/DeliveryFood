import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, type SessionUser } from "@/lib/permissions";
import { ComandasPanel } from "@/components/admin/comandas-panel";
import { ComandaStatus, UserType } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comandas" };

export default async function ComandasPage() {
  const session = (await auth()) as unknown as {
    user?: { id: string; userType: UserType; role: SessionUser["role"] };
  };
  const employee: SessionUser | null = session?.user
    ? {
        id: session.user.id,
        userType: session.user.userType,
        role: session.user.role,
      }
    : null;

  const [tables, comandas, products, customers] = await Promise.all([
    prisma.restaurantTable.findMany({
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        label: true,
        seats: true,
        area: true,
        active: true,
      },
    }),
    prisma.comanda.findMany({
      where: { status: ComandaStatus.OPEN },
      orderBy: { openedAt: "asc" },
      include: {
        table: { select: { label: true, number: true } },
        customer: { select: { name: true } },
        items: {
          orderBy: { createdAt: "asc" },
          include: { options: true },
        },
      },
    }),
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        category: { select: { name: true } },
        optionGroups: {
          where: { active: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
          include: {
            options: {
              where: { active: true },
              orderBy: [{ order: "asc" }, { name: "asc" }],
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { userType: UserType.CUSTOMER, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
      take: 200,
    }),
  ]);

  const tableViews = tables.map((table) => ({
    ...table,
    label: table.label,
  }));

  const comandaViews = comandas.map((comanda) => ({
    id: comanda.id,
    number: comanda.number,
    tableId: comanda.tableId,
    tableName: comanda.table.label || `Mesa ${comanda.table.number}`,
    customerName: comanda.customerName || comanda.customer?.name || null,
    observation: comanda.observation,
    openedAt: comanda.openedAt.toISOString(),
    total: comanda.items.reduce((sum, item) => sum + item.subtotal, 0),
    items: comanda.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
      options: item.options.map((option) => ({
        groupName: option.groupName,
        optionName: option.optionName,
        quantity: option.quantity,
        unitPrice: option.unitPrice,
      })),
    })),
  }));

  const productViews = products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    categoryName: product.category.name,
    optionGroups: product.optionGroups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      minQuantity: group.minQuantity,
      maxQuantity: group.maxQuantity,
      required: group.required,
      order: group.order,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        price: option.price,
        order: option.order,
      })),
    })),
  }));

  return (
    <ComandasPanel
      tables={JSON.parse(JSON.stringify(tableViews))}
      comandas={JSON.parse(JSON.stringify(comandaViews))}
      products={JSON.parse(JSON.stringify(productViews))}
      customers={JSON.parse(JSON.stringify(customers))}
      canConfirmPayments={can(employee, "payments.confirm")}
    />
  );
}
