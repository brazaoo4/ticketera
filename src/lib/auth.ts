import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import {
  isLoginRateLimited,
  recordFailedLogin,
  clearLoginRateLimit,
} from "@/lib/rate-limit";

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
  enabled: boolean;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials: Partial<Record<"username" | "password", unknown>>) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const username = String(credentials.username).trim();
        const password = String(credentials.password);

        // Brute-force rate limiting: 10 failed attempts per 15 minutes per username
        if (await isLoginRateLimited(username)) {
          throw new Error("TOO_MANY_ATTEMPTS");
        }

        try {
          const userCount = await prisma.user.count();

          // 1. If no users exist, the 1st login automatically creates and claims the root ADMIN account!
          if (userCount === 0) {
            // Password policy: min 8 characters; username 3-32 alphanumeric/dash/underscore/dot
            if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username) || password.length < 8) {
              throw new Error("INVALID_CREDENTIALS_POLICY");
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const firstAdmin = await prisma.user.create({
              data: {
                username,
                password: hashedPassword,
                role: "ADMIN",
                enabled: true,
              },
            });
            console.log(`[Auth] Empty database detected: created initial ADMIN account: "${username}".`);
            return {
              id: firstAdmin.id,
              name: firstAdmin.username,
              username: firstAdmin.username,
              role: firstAdmin.role,
            };
          }

          const user = await prisma.user.findUnique({
            where: { username },
          });

          if (!user) {
            await recordFailedLogin(username);
            return null;
          }

          if (!user.enabled) {
            throw new Error("ACCOUNT_DISABLED");
          }

          const isValid = await bcrypt.compare(password, user.password);
          if (!isValid) {
            await recordFailedLogin(username);
            return null;
          }

          // Successful authentication: clear failure count
          await clearLoginRateLimit(username);

          return {
            id: user.id,
            name: user.username,
            username: user.username,
            role: user.role,
          };
        } catch (error) {
          if (
            error instanceof Error &&
            (error.message === "ACCOUNT_DISABLED" ||
              error.message === "TOO_MANY_ATTEMPTS" ||
              error.message === "INVALID_CREDENTIALS_POLICY")
          ) {
            throw error;
          }
          console.error("Auth authorize error:", error);
          return null;
        }
      },
    }),
  ],
});

/**
 * Validates the current session AND verifies against PostgreSQL that the user still exists and is enabled.
 * Used across Server Actions and API endpoints for immediate session revocation when a user is disabled or deleted.
 */
export async function requireAuthUser(): Promise<AuthenticatedUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, username: true, role: true, enabled: true },
  });

  if (!user || !user.enabled) {
    throw new Error("Unauthorized");
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role as "ADMIN" | "USER",
    enabled: user.enabled,
  };
}

/**
 * Validates that the active session belongs to an enabled user with role === 'ADMIN'.
 */
export async function requireAdminUser(): Promise<AuthenticatedUser> {
  const user = await requireAuthUser();
  if (user.role !== "ADMIN") {
    throw new Error("Forbidden: Administrator privileges required");
  }
  return user;
}
