import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Equipe" };

/** Motoboys não fazem parte da operação do restaurante. */
export default function EntregadoresPage() {
  redirect("/admin/colaboradores");
}
