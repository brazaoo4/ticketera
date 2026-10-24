"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Loader2,
  Receipt,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg("Please enter both username and password.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await signIn("credentials", {
        username: username.trim(),
        password,
        redirect: false,
      });

      if (!res || res.error) {
        if (res?.error?.includes("ACCOUNT_DISABLED")) {
          setErrorMsg(
            "Your account has been disabled by an administrator."
          );
        } else if (res?.error?.includes("TOO_MANY_ATTEMPTS")) {
          setErrorMsg(
            "Too many failed attempts. Please wait 15 minutes before trying again."
          );
        } else if (res?.error?.includes("INVALID_CREDENTIALS_POLICY")) {
          setErrorMsg(
            "Username must be 3-32 characters and password must be at least 8 characters."
          );
        } else {
          setErrorMsg(
            "Invalid credentials. Please verify your username and password."
          );
        }
        setIsLoading(false);
        return;
      }

      // Success
      router.push(callbackUrl);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Unexpected error connecting to the server."
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Sleek Consumer Sign-In Card */}
      <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center space-y-2 mb-8">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 items-center justify-center shadow-lg shadow-emerald-500/20 mb-2">
            <Receipt className="w-6 h-6 text-zinc-950 stroke-[2.2]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Welcome back
          </h1>
          <p className="text-sm text-zinc-400">
            Sign in to your Ticketera account
          </p>
        </div>

        {/* Inline Error Banner */}
        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-3 p-3.5 mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs animate-in fade-in duration-150"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">{errorMsg}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="username"
              className="block text-xs font-medium text-zinc-300"
            >
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                <User className="w-4 h-4" />
              </div>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full pl-10 pr-3.5 py-2.5 bg-zinc-950/70 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-medium text-zinc-300"
            >
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-10 py-2.5 bg-zinc-950/70 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-zinc-950 font-semibold text-sm shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 flex items-center justify-center">
      <Suspense
        fallback={
          <div className="text-center text-zinc-500 text-xs">
            Loading sign in...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
