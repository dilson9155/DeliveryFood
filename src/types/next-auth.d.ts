import "next-auth";
import "next-auth/jwt";
import type { DefaultSession } from "next-auth";
import type { UserType, EmployeeRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      userType: UserType;
      role: EmployeeRole | null;
      phone?: string;
    } & DefaultSession["user"];
  }

  interface User {
    userType: UserType;
    role: EmployeeRole | null;
    phone?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userType?: UserType;
    role?: EmployeeRole | null;
    phone?: string;
  }
}