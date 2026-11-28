import { redirect } from "next/navigation";

/** Endereço antigo: mantido apenas como atalho para a fila única. */
export default function OldDeliveriesPage() {
  redirect("/admin/fila-pedidos");
}
