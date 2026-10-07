import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  const session = req.auth;
  const { pathname } = req.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");
  if (isAdminRoute) {
    if (!session?.user || session.user.userType !== "EMPLOYEE") {
      const url = new URL("/login", req.url);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }

    const role = session.user.role;
    if (pathname.startsWith("/admin/colaboradores") && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
    if (pathname.startsWith("/admin/configuracoes") && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
    if (pathname.startsWith("/admin/relatorios") && role !== "ADMIN" && role !== "MANAGER") {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
    if (pathname.startsWith("/admin/clientes") && role !== "ADMIN" && role !== "MANAGER" && role !== "ATTENDANT") {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
    if (pathname.startsWith("/admin/caixa") && role !== "ADMIN" && role !== "MANAGER" && role !== "CASHIER") {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
    if (pathname.startsWith("/admin/pedidos") && !role) {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/meus-pedidos") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/meus-dados") ||
    pathname.startsWith("/notificacoes")
  ) {
    if (!session?.user) {
      const url = new URL("/login", req.url);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/admin") === false && session?.user?.userType === "EMPLOYEE") {
    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|workbox-*|.*\\..*).*)",
  ],
};