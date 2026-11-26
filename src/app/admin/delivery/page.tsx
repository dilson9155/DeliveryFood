import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comandas" };

/** Módulo de entregas desativado: operação de restaurante (salão + balcão). */
export default function DeliveryPage() {
  redirect("/admin/pedidos");
}
