import { redirect } from "next/navigation";

/** A fila simplificada substitui o antigo quadro de etapas. */
export default function OrdersPage() {
  redirect("/admin/fila-pedidos");
}
