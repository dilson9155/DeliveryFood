import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SettingsPanel } from "@/components/admin/settings-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const [settings, hours] = await Promise.all([
    prisma.settings.findUnique({ where: { id: "default" } }),
    prisma.businessHours.findMany({ orderBy: { dayOfWeek: "asc" } }),
  ]);

  return (
    <SettingsPanel
      settings={JSON.parse(JSON.stringify(settings))}
      hours={JSON.parse(JSON.stringify(hours))}
    />
  );
}