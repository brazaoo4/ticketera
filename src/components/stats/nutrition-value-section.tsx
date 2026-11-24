"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Leaf,
  Sparkles,
  Loader2,
  Award,
  AlertCircle,
  Check,
  ArrowUpRight,
} from "lucide-react";
import {
  computeNutritionBasketInsights,
  getNovaGroupMeta,
  getNutriScoreBadgeStyle,
  type NutritionItemInput,
} from "@/lib/analytics/nutrition";
import { enrichMissingNutritionBatchAction } from "@/app/my-stats/actions";

interface NutritionValueSectionProps {
  items: NutritionItemInput[];
  untaggedFoodProductCount: number;
}

export function NutritionValueSection({
  items,
  untaggedFoodProductCount,
}: NutritionValueSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const insights = useMemo(
    () => computeNutritionBasketInsights(items),
    [items]
  );

  const handleEnrichBatch = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await enrichMissingNutritionBatchAction(8);
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Analyzed ${res.processedCount} products via OpenFoodFacts (${res.enrichedCount} enriched${
            res.remainingCount ? `, ${res.remainingCount} remaining` : ""
          }).`,
        });
        router.refresh();
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to fetch nutrition metadata.",
        });
      }
    });
  };

  const hasAnyNutritionData =
    insights.taggedNovaItemCount > 0 ||
    insights.taggedNutriScoreItemCount > 0 ||
    insights.proteinPerEuroRankings.length > 0;

  return (
    <section className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div className="space-y-1">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Leaf className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Nutrition & Protein Value Insights</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Cached OpenFoodFacts Nutri-Score, NOVA processing share, and protein-per-euro efficiency.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <span className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-400 whitespace-nowrap shrink-0 tabular-nums">
            {insights.taggedProductCount} / {insights.totalFoodProductCount} food products tagged
          </span>

          {untaggedFoodProductCount > 0 && (
            <button
              type="button"
              onClick={handleEnrichBatch}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              <span>
                {isPending
                  ? "Fetching OpenFoodFacts..."
                  : `Fetch Missing (${Math.min(untaggedFoodProductCount, 8)})`}
              </span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          {feedback.type === "success" ? (
            <Check className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {!hasAnyNutritionData ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-6 text-center space-y-3">
          <p className="text-xs text-zinc-400 max-w-lg mx-auto">
            No cached nutritional metadata yet for your food purchases. Fetch lightweight Nutri-Score, NOVA group, and protein data from OpenFoodFacts to unlock protein-per-€ rankings and NOVA 4 share.
          </p>
          {untaggedFoodProductCount > 0 && (
            <button
              type="button"
              onClick={handleEnrichBatch}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>Fetch Nutrition for Top Products</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* 3-Card Summary Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Ultra-Processed (NOVA 4) Basket Share */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                <span>Ultra-Processed (NOVA 4)</span>
                <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 whitespace-nowrap shrink-0">
                  By Spend
                </span>
              </div>

              {insights.taggedNovaItemCount > 0 ? (
                <>
                  <div className="flex items-baseline gap-2 font-mono tabular-nums">
                    <span
                      className={`text-2xl sm:text-3xl font-extrabold ${
                        insights.nova4SharePercent >= 35
                          ? "text-rose-400"
                          : insights.nova4SharePercent >= 20
                          ? "text-amber-300"
                          : "text-emerald-400"
                      }`}
                    >
                      {insights.nova4SharePercent.toFixed(1)}%
                    </span>
                    <span className="text-xs text-zinc-400">
                      (€{insights.nova4Spend.toFixed(2)})
                    </span>
                  </div>

                  {/* NOVA 1-4 stacked bar */}
                  <div className="h-2.5 w-full rounded-full bg-zinc-900 overflow-hidden flex">
                    {insights.novaBreakdown.map((nb) => {
                      const meta = getNovaGroupMeta(nb.group);
                      if (!meta || nb.shareOfTaggedPercent <= 0) return null;
                      return (
                        <div
                          key={nb.group}
                          title={`${meta.label}: ${nb.shareOfTaggedPercent}% (€${nb.spend.toFixed(
                            2
                          )})`}
                          style={{
                            width: `${nb.shareOfTaggedPercent}%`,
                            backgroundColor: meta.barColor,
                          }}
                          className="h-full"
                        />
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                    {insights.novaBreakdown.map((nb) => {
                      const meta = getNovaGroupMeta(nb.group)!;
                      return (
                        <span
                          key={nb.group}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 whitespace-nowrap shrink-0 tabular-nums"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: meta.barColor }}
                          />
                          <span>N{nb.group}:</span>
                          <strong>{nb.shareOfTaggedPercent.toFixed(0)}%</strong>
                        </span>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-xs text-zinc-500 font-mono">
                  No NOVA-tagged food items in selected timeframe.
                </p>
              )}
            </div>

            {/* Card 2: Nutri-Score Basket Distribution */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                <span>Nutri-Score Profile</span>
                <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 whitespace-nowrap shrink-0 tabular-nums">
                  €{insights.taggedNutriScoreSpend.toFixed(2)}
                </span>
              </div>

              {insights.taggedNutriScoreItemCount > 0 ? (
                <div className="space-y-2">
                  {insights.nutriScoreBreakdown.map((ns) => {
                    const style = getNutriScoreBadgeStyle(ns.grade)!;
                    return (
                      <div
                        key={ns.grade}
                        className="flex items-center gap-2 text-xs font-mono tabular-nums"
                      >
                        <span
                          className={`w-6 text-center py-0.5 rounded border text-[10px] font-bold whitespace-nowrap shrink-0 ${style.className}`}
                        >
                          {style.letter}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-zinc-900 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500/80"
                            style={{ width: `${ns.shareOfTaggedPercent}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-zinc-300">
                          {ns.shareOfTaggedPercent.toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 font-mono">
                  No Nutri-Score data cached in selected timeframe.
                </p>
              )}
            </div>

            {/* Card 3: Best Protein Efficiency Highlight */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                <span>Top Protein Value</span>
                <Award className="w-4 h-4 text-emerald-400 shrink-0" />
              </div>

              {insights.proteinPerEuroRankings.length > 0 ? (
                <>
                  <div>
                    <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 tabular-nums">
                      {insights.proteinPerEuroRankings[0].proteinPerEuro.toFixed(1)}{" "}
                      <span className="text-sm font-semibold text-zinc-300">
                        g / €
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white truncate mt-1">
                      {insights.proteinPerEuroRankings[0].productName}
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-[11px] font-mono text-zinc-400 flex items-center justify-between gap-2 tabular-nums">
                    <span className="truncate">
                      {insights.proteinPerEuroRankings[0].proteinPer100g}g / 100g
                    </span>
                    <span className="text-zinc-200 font-semibold whitespace-nowrap shrink-0">
                      €{insights.proteinPerEuroRankings[0].pricePerBaseUnit.toFixed(2)}/
                      {insights.proteinPerEuroRankings[0].baseUnit.toLowerCase()}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-zinc-500 font-mono">
                  Requires weight/volume (KG or L) items with cached protein/100g.
                </p>
              )}
            </div>
          </div>

          {/* Protein per € Rankings Table */}
          {insights.proteinPerEuroRankings.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300">
                  Protein per € Rankings (KG & L Staples)
                </h3>
                <span className="text-[11px] font-mono text-zinc-500">
                  Grams of protein per euro spent
                </span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950/60">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[11px] text-zinc-400 uppercase tracking-wider">
                      <th className="py-2.5 px-4">Product</th>
                      <th className="py-2.5 px-3 text-center">Scores</th>
                      <th className="py-2.5 px-3 text-right">Protein / 100g</th>
                      <th className="py-2.5 px-3 text-right">Best Unit Price</th>
                      <th className="py-2.5 px-4 text-right">Protein / €</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {insights.proteinPerEuroRankings.map((row) => {
                      const nsStyle = getNutriScoreBadgeStyle(row.nutriScore);
                      const novaMeta = getNovaGroupMeta(row.novaGroup);
                      return (
                        <tr
                          key={row.productKey}
                          className="hover:bg-zinc-900/50 transition-colors"
                        >
                          <td className="py-2.5 px-4 font-sans">
                            <div className="flex items-center gap-2 min-w-0">
                              {row.productSlug ? (
                                <Link
                                  href={`/products/${row.productSlug}`}
                                  className="font-semibold text-zinc-100 hover:text-emerald-400 transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                >
                                  <span>{row.productName}</span>
                                  <ArrowUpRight className="w-3 h-3 text-zinc-500" />
                                </Link>
                              ) : (
                                <span className="font-semibold text-zinc-100">
                                  {row.productName}
                                </span>
                              )}
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white whitespace-nowrap shrink-0"
                                style={{ backgroundColor: row.storeBrandHex }}
                              >
                                {row.storeName}
                              </span>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-center">
                            <div className="inline-flex items-center gap-1">
                              {nsStyle && (
                                <span
                                  className={`px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap shrink-0 ${nsStyle.className}`}
                                >
                                  NS {nsStyle.letter}
                                </span>
                              )}
                              {novaMeta && (
                                <span
                                  className={`px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap shrink-0 ${novaMeta.className}`}
                                >
                                  {novaMeta.shortLabel}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-right text-zinc-300 tabular-nums">
                            {row.proteinPer100g.toFixed(1)} g
                          </td>

                          <td className="py-2.5 px-3 text-right text-zinc-300 tabular-nums">
                            €{row.pricePerBaseUnit.toFixed(2)}/{row.baseUnit.toLowerCase()}
                          </td>

                          <td className="py-2.5 px-4 text-right font-bold text-emerald-400 tabular-nums">
                            {row.proteinPerEuro.toFixed(1)} g/€
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
