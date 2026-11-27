import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { businessDate, MENU_DATE_PATTERN } from "@/lib/daily-menu";
import { DailyMenuPanel } from "@/components/admin/daily-menu-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cardápio do dia" };

export default async function DailyMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date =
    params.date && MENU_DATE_PATTERN.test(params.date) ? params.date : businessDate();

  const [menus, menu] = await Promise.all([
    prisma.dailyMenu.findMany({
      orderBy: { date: "desc" },
      select: { id: true, date: true, title: true, active: true },
    }),
    prisma.dailyMenu.findUnique({
      where: { date },
      include: {
        meals: {
          orderBy: [{ order: "asc" }, { name: "asc" }],
          include: { prices: true },
        },
        sizes: { orderBy: [{ order: "asc" }, { name: "asc" }] },
      },
    }),
  ]);

  return (
    <DailyMenuPanel
      date={date}
      menus={JSON.parse(JSON.stringify(menus))}
      menu={menu ? JSON.parse(JSON.stringify(menu)) : null}
    />
  );
}
