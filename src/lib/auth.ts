import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { EmployeeRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Resolve um identificador (e-mail, telefone ou login) para um usuário ativo.
 * Usado pelo authorize e pelo loginAction (que não enxerga o cookie recém-criado).
 */
export async function findUserByIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  const isEmail = trimmed.includes("@");

  return prisma.user.findFirst({
    where: isEmail
      ? { email: trimmed.toLowerCase(), active: true }
      : {
          OR: [
            { phone: trimmed.replace(/\D/g, "") },
            { login: trimmed.toLowerCase() },
          ],
          active: true,
        },
  });
}

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

        const user = await findUserByIdentifier(identifier);

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