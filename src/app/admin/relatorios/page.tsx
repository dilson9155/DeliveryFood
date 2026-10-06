import type { Metadata } from "next";
import { ReportsView } from "@/components/admin/reports-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Relatórios" };

export default async function ReportsPage() {
  return <ReportsView />;
}