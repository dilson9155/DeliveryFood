import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can, type SessionUser } from "@/lib/permissions";
import { businessDate } from "@/lib/daily-menu";
import { ComandaStatus, UserType } from "@prisma/client";
import { PosPanel, type PosComanda } from "@/components/admin/pos-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "PDV" };

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ comanda?: string }>;
}) {
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

  const { comanda: comandaId } = await searchParams;

  const [products, customers, comandaRow, dailyMenu, selfServiceSettings] = await Promise.all([
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
    comandaId
      ? prisma.comanda.findFirst({
          where: { id: comandaId, status: ComandaStatus.OPEN },
          include: {
            table: { select: { label: true, number: true } },
            customer: { select: { name: true, phone: true } },
            items: { orderBy: { createdAt: "asc" }, include: { options: true } },
          },
        })
      : Promise.resolve(null),
    prisma.dailyMenu.findUnique({
      where: { date: businessDate() },
      include: {
        meals: {
          where: { active: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
          include: { prices: true },
        },
        sizes: {
          where: { active: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
        },
      },
    }),
    prisma.settings.findUnique({
      where: { id: "default" },
      select: { selfServicePricePerKg: true, selfServiceFixedPrice: true },
    }),
  ]);

  const dailyMeals = dailyMenu?.active
    ? dailyMenu.meals.map((meal) => ({
        menuId: dailyMenu.id,
        mealId: meal.id,
        name: meal.name,
        description: meal.description,
        availableQty: meal.availableQty,
        sizes: dailyMenu.sizes.flatMap((size) => {
          const price = meal.prices.find((row) => row.sizeId === size.id);
          return price ? [{ id: size.id, name: size.name, price: price.price }] : [];
        }),
      }))
    : [];

  const comanda: PosComanda | null = comandaRow
    ? {
        id: comandaRow.id,
        number: comandaRow.number,
        tableName: comandaRow.table.label ?? `Mesa ${comandaRow.table.number}`,
        customerName: comandaRow.customerName ?? comandaRow.customer?.name ?? null,
        customerPhone: comandaRow.customer?.phone ?? null,
        observation: comandaRow.observation,
        openedAt: comandaRow.openedAt.toISOString(),
        items: comandaRow.items.map((item) => ({
          id: item.id,
          productId: item.productId ?? "",
          productName: item.productName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.subtotal,
          options: item.options.map((option) => ({
            groupId: option.groupId ?? "",
            optionId: option.optionId ?? "",
            groupName: option.groupName,
            optionName: option.optionName,
            quantity: option.quantity,
            unitPrice: option.unitPrice,
          })),
        })),
      }
    : null;

  return (
    <div className="space-y-3">
      {comandaId && !comanda && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          A comanda solicitada não está mais aberta. Uma nova venda foi iniciada no balcão.
        </div>
      )}
      <PosPanel
        canConfirmPayments={canConfirmPayments}
        comanda={JSON.parse(JSON.stringify(comanda)) as PosComanda | null}
        dailyMeals={JSON.parse(JSON.stringify(dailyMeals))}
        selfServicePrices={{
          pricePerKg: selfServiceSettings?.selfServicePricePerKg ?? 0,
          fixedPrice: selfServiceSettings?.selfServiceFixedPrice ?? 0,
        }}
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
    </div>
  );
}
