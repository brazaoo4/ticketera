"use client";

import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallAppButton({ className }: { className?: string }) {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () =>
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  }

  if (!installPrompt) return null;

  return (
    <button
      type="button"
      onClick={installApp}
      aria-label="Install app"
      title="Install Ticketera app"
      className={
        className ||
        "inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[var(--primary)] hover:bg-[var(--bg-subtle)] transition-colors whitespace-nowrap text-[13px] font-medium cursor-pointer"
      }
    >
      <Download className="w-4 h-4 shrink-0" />
      <span className="whitespace-nowrap">Install app</span>
    </button>
  );
}
