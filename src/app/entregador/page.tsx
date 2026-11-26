import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cardápio" };

/** Painel do motoboy desativado na operação de restaurante. */
export default function MotoboyPage() {
  redirect("/");
}
