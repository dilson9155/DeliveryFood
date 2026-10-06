import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MotoboyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.userType !== "EMPLOYEE" || session.user.role !== "MOTOBOY") {
    redirect("/");
  }
  return <>{children}</>;
}