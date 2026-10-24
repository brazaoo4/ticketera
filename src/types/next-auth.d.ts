import { DefaultSession } from "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    username: string;
    role: "ADMIN" | "USER";
  }

  interface Session {
    user: {
      id: string;
      username: string;
      role: "ADMIN" | "USER";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: "ADMIN" | "USER";
  }
}
