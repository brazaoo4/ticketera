"use client";

import React, { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";

function getSafeCallbackUrl(raw: string | null): string {
  if (
    raw &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.startsWith("/\\")
  ) {
    return raw;
  }
  return "/my-receipts";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl"));

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("Please enter both your username and password.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn("credentials", {
        username: username.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        if (result.error.includes("ACCOUNT_DISABLED")) {
          setError(
            "This account has been deactivated. Contact your household admin."
          );
        } else if (result.error.includes("TOO_MANY_ATTEMPTS")) {
          setError(
            "Too many sign-in attempts. Please wait a few minutes and try again."
          );
        } else if (result.error.includes("INVALID_CREDENTIALS_POLICY")) {
          setError("Please enter both a username and password.");
        } else {
          setError("Invalid username or password. Please try again.");
        }
        setIsLoading(false);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Could not sign in right now. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-58px)] md:min-h-[calc(100vh-68px)] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px] space-y-6">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:p-8 shadow-[var(--shadow-soft)] space-y-6">
            <div className="space-y-1.5">
              <h1 className="font-display font-bold text-[26px] leading-tight text-[var(--text-primary)]">
                Sign in to Ticketera
              </h1>
              <p className="text-[14px] text-[var(--text-muted)]">
                Access your household receipts, pantry catalogue, and spending
                reports.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl bg-[var(--negative-tint)] border border-[var(--negative)]/30 px-4 py-3 flex items-start gap-2.5 text-[13px] text-[var(--negative)]"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="login-username"
                  className="block text-[13px] font-medium text-[var(--text-primary)]"
                >
                  Username
                </label>
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  placeholder="Enter your username"
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-[13px] font-medium text-[var(--text-primary)]"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    placeholder="Enter your password"
                    className="w-full h-11 pl-3.5 pr-16 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-2.5 rounded-lg text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] inline-flex items-center gap-1 cursor-pointer"
                  >
                    {showPassword ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        Hide
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Show
                      </>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[14px] font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-[13px] text-[var(--text-muted)]">
            <Link
              href="/"
              className="hover:text-[var(--text-primary)] transition-colors"
            >
              Back to public price tracker
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center text-[14px] text-[var(--text-muted)]">
          Loading sign-in...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
