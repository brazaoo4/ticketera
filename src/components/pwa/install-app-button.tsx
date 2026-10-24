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
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
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
      aria-label="Install App"
      title="Install Ticketera App"
      className={
        className ||
        "flex items-center gap-2 px-3 py-2 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-zinc-900 transition-colors whitespace-nowrap text-xs font-semibold"
      }
    >
      <Download className="w-3.5 h-3.5 shrink-0" />
      <span className="whitespace-nowrap">Install App</span>
    </button>
  );
}
