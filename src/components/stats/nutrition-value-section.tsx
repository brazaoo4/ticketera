"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  RotateCcw,
  X,
} from "lucide-react";
import {
  computeNutritionBasketInsights,
  getNovaGroupMeta,
  getNutriScoreBadgeStyle,
  type NutritionItemInput,
} from "@/lib/analytics/nutrition";
import { enrichMissingNutritionBatchAction } from "@/app/my-stats/actions";
import {
  formatCurrency,
  formatPercent,
  getStoreBrand,
  normalizeUnit,
} from "@/lib/format";

interface NutritionValueSectionProps {
  items: NutritionItemInput[];
  untaggedFoodProductCount: number;
  unmatchedFoodProductCount?: number;
}

interface EnrichmentProgress {
  mode: "missing" | "retry";
  total: number;
  checked: number;
  enriched: number;
  notFound: number;
  failed: number;
}

export function NutritionValueSection({
  items,
  untaggedFoodProductCount,
  unmatchedFoodProductCount = 0,
}: NutritionValueSectionProps) {
  const router = useRouter();
  const [isEnriching, setIsEnriching] = useState(false);
  const [progress, setProgress] = useState<EnrichmentProgress | null>(null);
  const cancelRef = useRef(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const insights = useMemo(
    () => computeNutritionBasketInsights(items),
    [items]
  );

  const handleRunEnrichment = async (mode: "missing" | "retry") => {
    if (isEnriching) return;

    const initialTotal =
      mode === "retry"
        ? untaggedFoodProductCount + unmatchedFoodProductCount
        : untaggedFoodProductCount;
    if (initialTotal <= 0) return;

    cancelRef.current = false;
    setIsEnriching(true);
    setFeedback(null);
    setProgress({
      mode,
      total: initialTotal,
      checked: 0,
      enriched: 0,
      notFound: 0,
      failed: 0,
    });

    const triedIds: string[] = [];
    let checked = 0;
    let enriched = 0;
    let notFound = 0;
    let failed = 0;
    let remaining = initialTotal;
    let batchIdx = 0;

    try {
      while (!cancelRef.current) {
        const res = await enrichMissingNutritionBatchAction({
          limit: 8,
          excludeProductIds: triedIds,
          includePreviouslyMissed: mode === "retry",
        });

        if (!res.success) {
          setFeedback({
            type: "error",
            message:
              checked > 0
                ? `Stopped after checking ${checked} groceries (${enriched} updated): ${
                    res.error || "OpenFoodFacts request failed."
                  }`
                : res.error || "Could not fetch nutrition details.",
          });
          if (enriched > 0 || checked > 0) {
            router.refresh();
          }
          return;
        }

        if (Array.isArray(res.processedIds)) {
          for (const id of res.processedIds) {
            if (!triedIds.includes(id)) triedIds.push(id);
          }
        }

        const batchProcessed = res.processedCount ?? 0;
        const batchEnriched = res.enrichedCount ?? 0;
        checked += batchProcessed;
        enriched += batchEnriched;
        notFound += res.notFoundCount ?? 0;
        failed += res.failedCount ?? 0;
        remaining = res.remainingCount ?? 0;

        setProgress((prev) => ({
          mode,
          total: Math.max(prev?.total ?? initialTotal, checked + remaining),
          checked,
          enriched,
          notFound,
          failed,
        }));

        batchIdx++;
        if (batchEnriched > 0 && batchIdx % 2 === 0 && remaining > 0) {
          router.refresh();
        }

        if (remaining <= 0 || batchProcessed === 0) {
          break;
        }
      }

      if (cancelRef.current) {
        setFeedback({
          type: "success",
          message: `Paused after checking ${checked} groceries (${enriched} updated${
            remaining > 0 ? `, ${remaining} remaining` : ""
          }).`,
        });
      } else {
        const details: string[] = [`${enriched} updated`];
        if (notFound > 0) details.push(`${notFound} no OpenFoodFacts match`);
        if (failed > 0) details.push(`${failed} timed out (retryable)`);
        setFeedback({
          type: "success",
          message: `Checked ${checked} groceries via OpenFoodFacts (${details.join(", ")}).`,
        });
      }

      router.refresh();
    } catch {
      setFeedback({
        type: "error",
        message:
          checked > 0
            ? `Stopped after checking ${checked} groceries (${enriched} updated) due to a network error.`
            : "Could not reach OpenFoodFacts right now.",
      });
      if (checked > 0) {
        router.refresh();
      }
    } finally {
      setIsEnriching(false);
      setProgress(null);
    }
  };

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.checked / progress.total) * 100))
      : 0;

  const hasAnyNutritionData =
    insights.taggedNovaItemCount > 0 ||
    insights.taggedNutriScoreItemCount > 0 ||
    insights.proteinPerEuroRankings.length > 0;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div className="space-y-1">
          <h2 className="font-display text-[20px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Leaf className="w-5 h-5 text-[var(--primary)] shrink-0" />
            <span>Nutrition &amp; protein value</span>
          </h2>
          <p className="text-[13px] text-[var(--text-muted)]">
            Nutri-Score grades, food processing breakdown, and protein per euro
            across your grocery purchases.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <span className="h-8 px-3 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] text-[13px] text-[var(--text-muted)] inline-flex items-center whitespace-nowrap shrink-0 tabular-nums">
            {insights.taggedProductCount} / {insights.totalFoodProductCount}{" "}
            food items tagged
          </span>

          {isEnriching ? (
            <>
              <span className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[var(--primary-tint)] text-[var(--primary)] border border-[var(--primary)]/30 text-[13px] font-semibold whitespace-nowrap shrink-0 tabular-nums">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>
                  Fetching ({progress?.checked ?? 0}/{progress?.total ?? 0})…
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  cancelRef.current = true;
                }}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-[var(--border)] bg-[var(--bg-page)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5 shrink-0" />
                <span>Stop</span>
              </button>
            </>
          ) : untaggedFoodProductCount > 0 ? (
            <button
              type="button"
              onClick={() => void handleRunEnrichment("missing")}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[var(--primary-tint)] hover:border-[var(--primary)]/50 text-[var(--primary)] border border-[var(--primary)]/30 text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer tabular-nums"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Fetch all missing ({untaggedFoodProductCount})</span>
            </button>
          ) : unmatchedFoodProductCount > 0 ? (
            <button
              type="button"
              onClick={() => void handleRunEnrichment("retry")}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-page)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 transition-colors cursor-pointer tabular-nums"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Retry unmatched ({unmatchedFoodProductCount})</span>
            </button>
          ) : null}
        </div>
      </div>

      {isEnriching && progress && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-page)]/70 p-3.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] tabular-nums">
            <span className="text-[var(--text-primary)] font-medium">
              Checking OpenFoodFacts… {progress.checked} / {progress.total} ·{" "}
              {progress.enriched} matched
              {progress.notFound > 0
                ? ` · ${progress.notFound} not found`
                : ""}
              {progress.failed > 0 ? ` · ${progress.failed} timed out` : ""}
            </span>
            <span className="text-[var(--text-muted)]">{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-[13px] flex items-center gap-2 ${
            feedback.type === "success"
              ? "bg-[var(--positive-tint)] border-[var(--positive)]/30 text-[var(--positive)]"
              : "bg-[var(--negative-tint)] border-[var(--negative)]/30 text-[var(--negative)]"
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
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-page)]/60 p-6 text-center space-y-3">
          <p className="text-[13px] text-[var(--text-muted)] max-w-lg mx-auto">
            No nutritional metadata cached yet for your food purchases. Fetch
            Nutri-Score, NOVA group, and protein details from OpenFoodFacts to
            see protein-per-€ rankings and processing share.
          </p>
          {(untaggedFoodProductCount > 0 || unmatchedFoodProductCount > 0) && (
            <button
              type="button"
              onClick={() =>
                void handleRunEnrichment(
                  untaggedFoodProductCount > 0 ? "missing" : "retry"
                )
              }
              disabled={isEnriching}
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isEnriching ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 shrink-0" />
              )}
              <span>
                {untaggedFoodProductCount > 0
                  ? `Fetch nutrition for all ${untaggedFoodProductCount} groceries`
                  : `Retry ${unmatchedFoodProductCount} unmatched groceries`}
              </span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* 3-Card Summary Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Ultra-Processed (NOVA 4) Basket Share */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-page)]/50 p-4 space-y-3">
              <div className="flex items-center justify-between text-[13px] text-[var(--text-muted)]">
                <span className="font-medium">Ultra-processed (NOVA 4)</span>
                <span className="px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-primary)] whitespace-nowrap shrink-0">
                  By spend
                </span>
              </div>

              {insights.taggedNovaItemCount > 0 ? (
                <>
                  <div className="flex items-baseline gap-2 tabular-nums">
                    <span
                      className={`font-display text-2xl sm:text-3xl font-bold ${
                        insights.nova4SharePercent >= 35
                          ? "text-[var(--negative)]"
                          : insights.nova4SharePercent >= 20
                          ? "text-[var(--accent)]"
                          : "text-[var(--positive)]"
                      }`}
                    >
                      {formatPercent(insights.nova4SharePercent, {
                        showPlus: false,
                      })}
                    </span>
                    <span className="text-[13px] text-[var(--text-muted)]">
                      ({formatCurrency(insights.nova4Spend)})
                    </span>
                  </div>

                  {/* NOVA 1-4 stacked bar */}
                  <div className="h-2.5 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden flex">
                    {insights.novaBreakdown.map((nb) => {
                      const meta = getNovaGroupMeta(nb.group);
                      if (!meta || nb.shareOfTaggedPercent <= 0) return null;
                      return (
                        <div
                          key={nb.group}
                          title={`${meta.label}: ${formatPercent(
                            nb.shareOfTaggedPercent,
                            { showPlus: false }
                          )} (${formatCurrency(nb.spend)})`}
                          style={{
                            width: `${nb.shareOfTaggedPercent}%`,
                            backgroundColor: meta.barColor,
                          }}
                          className="h-full"
                        />
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                    {insights.novaBreakdown.map((nb) => {
                      const meta = getNovaGroupMeta(nb.group)!;
                      return (
                        <span
                          key={nb.group}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] whitespace-nowrap shrink-0 tabular-nums"
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: meta.barColor }}
                          />
                          <span>N{nb.group}:</span>
                          <strong>
                            {formatPercent(nb.shareOfTaggedPercent, {
                              decimals: 0,
                              showPlus: false,
                            })}
                          </strong>
                        </span>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-[var(--text-muted)]">
                  No NOVA-tagged food items in this period.
                </p>
              )}
            </div>

            {/* Card 2: Nutri-Score Basket Distribution */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-page)]/50 p-4 space-y-3">
              <div className="flex items-center justify-between text-[13px] text-[var(--text-muted)]">
                <span className="font-medium">Nutri-Score share</span>
                <span className="px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-primary)] whitespace-nowrap shrink-0 tabular-nums">
                  {formatCurrency(insights.taggedNutriScoreSpend)}
                </span>
              </div>

              {insights.taggedNutriScoreItemCount > 0 ? (
                <div className="space-y-2">
                  {insights.nutriScoreBreakdown.map((ns) => {
                    const style = getNutriScoreBadgeStyle(ns.grade)!;
                    return (
                      <div
                        key={ns.grade}
                        className="flex items-center gap-2 text-[13px] tabular-nums"
                      >
                        <span
                          className={`w-6 text-center py-0.5 rounded-md border font-semibold whitespace-nowrap shrink-0 leading-none ${style.className}`}
                        >
                          {style.letter}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--primary)]"
                            style={{ width: `${ns.shareOfTaggedPercent}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-[var(--text-muted)]">
                          {formatPercent(ns.shareOfTaggedPercent, {
                            decimals: 0,
                            showPlus: false,
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[13px] text-[var(--text-muted)]">
                  No Nutri-Score data cached in this period.
                </p>
              )}
            </div>

            {/* Card 3: Best Protein Efficiency Highlight */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-page)]/50 p-4 space-y-3">
              <div className="flex items-center justify-between text-[13px] text-[var(--text-muted)]">
                <span className="font-medium">Best protein value</span>
                <Award className="w-4 h-4 text-[var(--primary)] shrink-0" />
              </div>

              {insights.proteinPerEuroRankings.length > 0 ? (
                <>
                  <div>
                    <div className="font-display text-2xl sm:text-3xl font-bold text-[var(--primary)] tabular-nums">
                      {insights.proteinPerEuroRankings[0].proteinPerEuro
                        .toFixed(1)
                        .replace(".", ",")}{" "}
                      <span className="text-[14px] font-sans font-semibold text-[var(--text-muted)]">
                        g / €
                      </span>
                    </div>
                    <div className="text-[15px] font-semibold text-[var(--text-primary)] truncate mt-1">
                      {insights.proteinPerEuroRankings[0].productName}
                    </div>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[13px] text-[var(--text-muted)] flex items-center justify-between gap-2 tabular-nums">
                    <span className="truncate">
                      {insights.proteinPerEuroRankings[0].proteinPer100g
                        .toFixed(1)
                        .replace(".", ",")}
                      g / 100g
                    </span>
                    <span className="text-[var(--text-primary)] font-semibold whitespace-nowrap shrink-0">
                      {formatCurrency(
                        insights.proteinPerEuroRankings[0].pricePerBaseUnit
                      )}
                      /{normalizeUnit(insights.proteinPerEuroRankings[0].baseUnit)}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-[var(--text-muted)]">
                  Needs weight or volume (kg / L) items with cached protein data.
                </p>
              )}
            </div>
          </div>

          {/* Protein per € Rankings Table */}
          {insights.proteinPerEuroRankings.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Protein per € rankings (kg &amp; L items)
                </h3>
                <span className="text-[13px] text-[var(--text-muted)]">
                  Grams of protein per euro spent
                </span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-page)]/40">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[13px] text-[var(--text-muted)]">
                      <th className="py-3 px-4 font-medium">Product</th>
                      <th className="py-3 px-3 font-medium text-center">
                        Scores
                      </th>
                      <th className="py-3 px-3 font-medium text-right">
                        Protein / 100g
                      </th>
                      <th className="py-3 px-3 font-medium text-right">
                        Best unit price
                      </th>
                      <th className="py-3 px-4 font-medium text-right">
                        Protein / €
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {insights.proteinPerEuroRankings.map((row) => {
                      const nsStyle = getNutriScoreBadgeStyle(row.nutriScore);
                      const novaMeta = getNovaGroupMeta(row.novaGroup);
                      const brand = getStoreBrand(
                        row.storeName,
                        row.storeBrandHex
                      );
                      return (
                        <tr
                          key={row.productKey}
                          className="hover:bg-[var(--bg-subtle)]/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 min-w-0">
                              {row.productSlug ? (
                                <Link
                                  href={`/products/${row.productSlug}`}
                                  className="font-semibold text-[var(--text-primary)] hover:text-[var(--primary)] transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                                >
                                  <span>{row.productName}</span>
                                  <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                </Link>
                              ) : (
                                <span className="font-semibold text-[var(--text-primary)]">
                                  {row.productName}
                                </span>
                              )}
                              <span
                                className="px-2 py-0.5 rounded-full text-[13px] leading-none font-semibold whitespace-nowrap shrink-0"
                                style={{
                                  backgroundColor: brand.color,
                                  color: brand.fg,
                                }}
                              >
                                {row.storeName}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              {nsStyle && (
                                <span
                                  className={`px-2 py-0.5 rounded-full border text-[13px] leading-none font-semibold whitespace-nowrap shrink-0 ${nsStyle.className}`}
                                >
                                  NS {nsStyle.letter}
                                </span>
                              )}
                              {novaMeta && (
                                <span
                                  className={`px-2 py-0.5 rounded-full border text-[13px] leading-none font-semibold whitespace-nowrap shrink-0 ${novaMeta.className}`}
                                >
                                  {novaMeta.shortLabel}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right text-[var(--text-muted)] tabular-nums">
                            {row.proteinPer100g.toFixed(1).replace(".", ",")} g
                          </td>

                          <td className="py-3 px-3 text-right text-[var(--text-muted)] tabular-nums">
                            {formatCurrency(row.pricePerBaseUnit)}/
                            {normalizeUnit(row.baseUnit)}
                          </td>

                          <td className="py-3 px-4 text-right font-semibold text-[var(--primary)] tabular-nums">
                            {row.proteinPerEuro.toFixed(1).replace(".", ",")} g/€
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
