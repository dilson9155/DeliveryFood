import type { Metadata } from "next";
import { DashboardView } from "@/components/admin/dashboard-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  return <DashboardView />;
}