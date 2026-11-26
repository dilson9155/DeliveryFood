import type { Metadata } from "next";
import { TablesPanel } from "@/components/admin/tables-panel";
import { prisma } from "@/lib/prisma";
import { ComandaStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mesas" };

export default async function TablesPage() {
  const tables = await prisma.restaurantTable.findMany({
    orderBy: { number: "asc" },
    include: {
      comandas: {
        where: { status: ComandaStatus.OPEN },
        select: { id: true, number: true },
        take: 1,
      },
    },
  });

  return (
    <TablesPanel
      tables={JSON.parse(
        JSON.stringify(
          tables.map((table) => ({
            id: table.id,
            number: table.number,
            label: table.label,
            seats: table.seats,
            area: table.area,
            notes: table.notes,
            active: table.active,
            openComanda: table.comandas[0] ?? null,
          }))
        )
      )}
    />
  );
}
