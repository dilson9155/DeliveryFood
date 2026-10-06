import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { EmployeeRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Telefone, e-mail ou login", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const identifier = credentials?.identifier as string;
        const password = credentials?.password as string;
        if (!identifier || !password) return null;

        const trimmed = identifier.trim();
        const isEmail = trimmed.includes("@");

        const identifierNormalized = isEmail
          ? trimmed.toLowerCase()
          : trimmed.replace(/\D/g, "");

        const where = isEmail
          ? { email: identifierNormalized }
          : {
              OR: [
                { phone: identifierNormalized },
                { login: trimmed.toLowerCase() },
              ],
            };

        const user = await prisma.user.findFirst({
          where: { ...where, active: true },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email ?? undefined,
          phone: user.phone ?? undefined,
          userType: user.userType,
          role: user.role ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userType = user.userType;
        token.role = user.role;
        token.phone = user.phone;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.userType = token.userType as "CUSTOMER" | "EMPLOYEE";
        session.user.role = token.role as EmployeeRole | null;
        session.user.phone = token.phone as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
});