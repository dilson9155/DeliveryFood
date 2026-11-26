import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Middleware enxuto: lê somente o JWT do cookie, sem importar NextAuth completo,
 * Prisma ou bcrypt. Isso mantém o bundle abaixo do limite de 1 MB da Vercel.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({
    req: { headers: req.headers },
    secret: process.env.AUTH_SECRET,
    secureCookie: req.nextUrl.protocol === "https:",
  });

  const userType = token?.userType as "CUSTOMER" | "EMPLOYEE" | undefined;
  const role = token?.role as string | undefined;

  if (pathname.startsWith("/admin")) {
    if (!token?.sub || userType !== "EMPLOYEE") {
      const url = new URL("/login", req.url);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/admin/colaboradores") && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
    if (pathname.startsWith("/admin/configuracoes") && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
    if (pathname.startsWith("/admin/relatorios") && role !== "ADMIN" && role !== "MANAGER") {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
    if (
      pathname.startsWith("/admin/clientes") &&
      role !== "ADMIN" &&
      role !== "MANAGER" &&
      role !== "ATTENDANT"
    ) {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
    if (
      pathname.startsWith("/admin/caixa") &&
      role !== "ADMIN" &&
      role !== "MANAGER" &&
      role !== "CASHIER"
    ) {
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
    if (!token?.sub) {
      const url = new URL("/login", req.url);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|workbox-*|.*\\..*).*)",
  ],
};
