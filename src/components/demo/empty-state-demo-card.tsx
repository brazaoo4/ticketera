"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Upload, Sparkles, Loader2, Receipt } from "lucide-react";
import { loadDemoDataAction } from "@/lib/demo/actions";
import { useRouter } from "next/navigation";

export function EmptyStateDemoCard({
  title = "Bienvenido a Ticketera",
  description = "Aún no hay tickets verificados en el sistema. Puedes subir tu primer ticket de compra o cargar un conjunto de datos demo para explorar la plataforma.",
}: {
  title?: string;
  description?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLoadDemo = async () => {
    setIsLoading(true);
    try {
      const res = await loadDemoDataAction();
      if (res?.success) {
        router.refresh();
      } else {
        const errMsg = (res && "error" in res && typeof res.error === "string") ? res.error : "Desconocido";
        alert("Error cargando datos demo: " + errMsg);
      }
    } catch {
      alert("Error inesperado cargando datos demo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-8 sm:p-12 text-center max-w-2xl mx-auto backdrop-blur-xl space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10">
        <Receipt className="w-8 h-8 stroke-[2.2]" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{title}</h2>
        <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <Link
          href="/upload"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 whitespace-nowrap shrink-0"
        >
          <Upload className="w-4 h-4 stroke-[2.5] shrink-0" />
          <span>Subir Primer Ticket</span>
        </Link>

        <button
          onClick={handleLoadDemo}
          disabled={isLoading}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 font-semibold text-sm transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span>Cargar Datos Demo</span>
        </button>
      </div>
    </div>
  );
}
