import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can, type SessionUser } from "@/lib/permissions";
import { UserType } from "@prisma/client";
import { PosPanel } from "@/components/admin/pos-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "PDV" };

export default async function PosPage() {
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
  const canConfirmPayments = can(employee, "payments.confirm");

  const [products, customers] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        category: { select: { name: true } },
        optionGroups: {
          where: { active: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
          include: {
            options: { where: { active: true }, orderBy: [{ order: "asc" }, { name: "asc" }] },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { userType: UserType.CUSTOMER, active: true },
      orderBy: { name: "asc" },
      take: 1000,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        _count: { select: { orders: true } },
      },
    }),
  ]);

  return (
    <PosPanel
      canConfirmPayments={canConfirmPayments}
      products={JSON.parse(
        JSON.stringify(
          products.map((product) => ({
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
          }))
        )
      )}
      customers={JSON.parse(
        JSON.stringify(
          customers.map((customer) => ({
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            ordersCount: customer._count.orders,
          }))
        )
      )}
    />
  );
}
