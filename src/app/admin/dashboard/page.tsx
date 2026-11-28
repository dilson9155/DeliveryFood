import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Painel administrativo" };

export default async function DashboardPage() {
  redirect("/admin/menu-geral");
}
