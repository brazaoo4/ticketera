"use client";

import React, { useMemo, useState, useRef, useId, useTransition } from "react";
import {
  Target,
  SlidersHorizontal,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  X,
  Loader2,
  Calendar,
  Sparkles,
} from "lucide-react";
import { CANONICAL_CATEGORIES } from "@/lib/ai/schema";
import {
  OVERALL_BUDGET_CATEGORY,
  type BudgetReceiptInput,
  type BudgetItemInput,
  type UserBudgetTarget,
  type BudgetProgressRow,
  getAvailableBudgetMonths,
  computeMonthlyBudgetSummary,
  formatMonthKeyLabel,
} from "@/lib/analytics/budgets";
import { saveMonthlyBudgetsAction } from "@/app/my-stats/actions";
import { useNativeDialog } from "@/lib/ui/use-native-dialog";

interface MonthlyBudgetsSectionProps {
  receipts: BudgetReceiptInput[];
  items: BudgetItemInput[];
  initialBudgets: UserBudgetTarget[];
  categoryColors: Record<string, string>;
}

function getStatusBadge(status: BudgetProgressRow["status"]) {
  if (status === "over_budget") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[11px] font-mono font-bold whitespace-nowrap shrink-0">
        <AlertTriangle className="w-3 h-3 shrink-0" />
        <span>Over Budget</span>
      </span>
    );
  }
  if (status === "caution") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[11px] font-mono font-bold whitespace-nowrap shrink-0">
        <TrendingUp className="w-3 h-3 shrink-0" />
        <span>Pacing High</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-mono font-bold whitespace-nowrap shrink-0">
      <CheckCircle2 className="w-3 h-3 shrink-0" />
      <span>On Track</span>
    </span>
  );
}

function getBarColorClass(status: BudgetProgressRow["status"]): string {
  if (status === "over_budget") return "bg-rose-500";
  if (status === "caution") return "bg-amber-400";
  return "bg-emerald-500";
}

export function MonthlyBudgetsSection({
  receipts,
  items,
  initialBudgets,
  categoryColors,
}: MonthlyBudgetsSectionProps) {
  const [budgets, setBudgets] = useState<UserBudgetTarget[]>(initialBudgets);

  const availableMonths = useMemo(
    () => getAvailableBudgetMonths(receipts),
    [receipts]
  );

  // Default to current calendar month, or latest month with receipts if user wants
  const currentMonthKey = availableMonths.find((m) => m.isCurrent)?.key || availableMonths[0]?.key;
  const latestWithReceiptsKey = availableMonths.find((m) => m.receiptCount > 0)?.key;

  const [selectedMonth, setSelectedMonth] = useState<string>(
    currentMonthKey || ""
  );

  const summary = useMemo(
    () =>
      computeMonthlyBudgetSummary({
        receipts,
        items,
        budgets,
        monthKey: selectedMonth,
      }),
    [receipts, items, budgets, selectedMonth]
  );

  // Editor modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const editorDialogRef = useRef<HTMLDialogElement>(null);
  const editorTitleId = useId();

  useNativeDialog(editorDialogRef, isEditorOpen, () => setIsEditorOpen(false));

  const openEditor = (focusCategory?: string) => {
    const nextDraft: Record<string, string> = {};
    const existingMap = new Map(budgets.map((b) => [b.category, b.monthlyTarget]));

    const overallVal = existingMap.get(OVERALL_BUDGET_CATEGORY);
    nextDraft[OVERALL_BUDGET_CATEGORY] = overallVal ? String(overallVal) : "";

    for (const cat of CANONICAL_CATEGORIES) {
      const val = existingMap.get(cat);
      nextDraft[cat] = val ? String(val) : "";
    }

    if (focusCategory && !nextDraft[focusCategory]) {
      const avg = summary.historicalCategoryAverages[focusCategory];
      if (avg && avg > 0) {
        nextDraft[focusCategory] = String(Math.ceil(avg / 5) * 5);
      }
    }

    setDraftValues(nextDraft);
    setSaveError(null);
    setIsEditorOpen(true);
  };

  const handleSaveBudgets = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    const payload: Array<{ category: string; monthlyTarget: number | null }> = [];
    const allKeys = [OVERALL_BUDGET_CATEGORY, ...CANONICAL_CATEGORIES];

    for (const key of allKeys) {
      const raw = (draftValues[key] || "").trim();
      if (!raw) {
        payload.push({ category: key, monthlyTarget: null });
        continue;
      }
      const num = parseFloat(raw);
      if (!Number.isFinite(num) || num < 0 || num > 100_000) {
        setSaveError(
          `Invalid target for ${
            key === OVERALL_BUDGET_CATEGORY ? "Overall Budget" : key
          }. Enter a value between €1 and €100,000.`
        );
        return;
      }
      payload.push({ category: key, monthlyTarget: num > 0 ? num : null });
    }

    startTransition(async () => {
      const res = await saveMonthlyBudgetsAction(payload);
      if (res.success && res.budgets) {
        setBudgets(res.budgets);
        setIsEditorOpen(false);
      } else {
        setSaveError(res.error || "Could not save budgets.");
      }
    });
  };

  const hasAnyTargets = Boolean(
    summary.overallBudgetRow || summary.categoryBudgetRows.length > 0
  );

  return (
    <section className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div className="space-y-1">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Monthly Budgets & Pacing</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Track monthly grocery spending targets, end-of-month pacing projections, and store share.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Month Selector */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
            <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <select
              aria-label="Select budget month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-zinc-200 font-mono font-semibold focus:outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m.key} value={m.key} className="bg-zinc-950 text-zinc-100">
                  {m.label}
                  {m.isCurrent ? " (Current)" : ""} · {m.receiptCount}{" "}
                  {m.receiptCount === 1 ? "receipt" : "receipts"}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => openEditor()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs whitespace-nowrap shrink-0 transition-colors shadow-md shadow-emerald-500/20"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>{hasAnyTargets ? "Edit Budgets" : "Set Budgets"}</span>
          </button>
        </div>
      </div>

      {/* Empty month helper when current month has 0 spend but past months have receipts */}
      {summary.overallSpend === 0 &&
        latestWithReceiptsKey &&
        latestWithReceiptsKey !== selectedMonth && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-zinc-400">
              No confirmed receipts recorded yet for{" "}
              <strong className="text-zinc-200">
                {formatMonthKeyLabel(selectedMonth)}
              </strong>
              .
            </span>
            <button
              type="button"
              onClick={() => setSelectedMonth(latestWithReceiptsKey)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-emerald-400 font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              View {formatMonthKeyLabel(latestWithReceiptsKey)} →
            </button>
          </div>
        )}

      {/* Overall Summary + Overall Budget Card */}
      {!hasAnyTargets ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{formatMonthKeyLabel(selectedMonth)} Snapshot</span>
            </div>
            <div className="text-xl font-bold text-white font-mono tabular-nums">
              €{summary.overallSpend.toFixed(2)}{" "}
              <span className="text-xs font-normal text-zinc-400 font-sans">
                spent in {formatMonthKeyLabel(selectedMonth)}
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Set an overall monthly grocery cap or category targets (e.g. Dairy & Eggs, Meat & Poultry, Produce) to track live pacing projections and store share.
            </p>
          </div>

          <button
            type="button"
            onClick={() => openEditor()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs whitespace-nowrap shrink-0 self-start md:self-auto transition-colors"
          >
            <Target className="w-4 h-4 shrink-0" />
            <span>Configure Monthly Targets</span>
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Overall Target Card (or Monthly Spend + Store Share Summary) */}
          {summary.overallBudgetRow ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                      Overall Monthly Target ({formatMonthKeyLabel(selectedMonth)})
                    </span>
                    {getStatusBadge(summary.overallBudgetRow.status)}
                  </div>
                  <div className="flex items-baseline gap-2 font-mono tabular-nums">
                    <span className="text-2xl sm:text-3xl font-extrabold text-white">
                      €{summary.overallBudgetRow.currentSpend.toFixed(2)}
                    </span>
                    <span className="text-sm text-zinc-400">
                      / €{summary.overallBudgetRow.monthlyTarget.toFixed(2)}
                    </span>
                    <span className="text-xs text-zinc-500">
                      ({summary.overallBudgetRow.percentUsed.toFixed(1)}%)
                    </span>
                  </div>
                </div>

                <div className="text-left sm:text-right space-y-1 font-mono text-xs">
                  <div
                    className={`font-semibold ${
                      summary.overallBudgetRow.status === "over_budget"
                        ? "text-rose-400"
                        : summary.overallBudgetRow.status === "caution"
                        ? "text-amber-300"
                        : "text-emerald-400"
                    }`}
                  >
                    {summary.overallBudgetRow.pacingSummaryText}
                  </div>
                  {summary.isCurrentMonth && (
                    <div className="text-[11px] text-zinc-400 tabular-nums">
                      Day {summary.daysElapsed} of {summary.daysInMonth} (
                      {summary.pacePercent.toFixed(0)}% of month) ·{" "}
                      {summary.overallBudgetRow.remaining >= 0
                        ? `€${summary.overallBudgetRow.dailyAllowanceRemaining.toFixed(
                            2
                          )}/day left`
                        : `€${Math.abs(summary.overallBudgetRow.remaining).toFixed(
                            2
                          )} over`}
                    </div>
                  )}
                </div>
              </div>

              {/* Progress bar with vertical pace tick */}
              <div className="relative h-3 w-full rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getBarColorClass(
                    summary.overallBudgetRow.status
                  )}`}
                  style={{
                    width: `${Math.min(100, summary.overallBudgetRow.percentUsed)}%`,
                  }}
                />
                {summary.isCurrentMonth && summary.pacePercent > 0 && summary.pacePercent < 100 && (
                  <div
                    title={`Month pace: ${summary.pacePercent.toFixed(0)}%`}
                    className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10"
                    style={{ left: `${summary.pacePercent}%` }}
                  />
                )}
              </div>

              {/* Store-Share Breakdown Bar */}
              {summary.overallStoreShares.length > 0 && (
                <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <span>Store Share ({formatMonthKeyLabel(selectedMonth)})</span>
                    <span className="tabular-nums">
                      {summary.overallStoreShares.length}{" "}
                      {summary.overallStoreShares.length === 1 ? "store" : "stores"}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-900 overflow-hidden flex">
                    {summary.overallStoreShares.map((s) => (
                      <div
                        key={s.storeName}
                        title={`${s.storeName}: €${s.spend.toFixed(2)} (${s.sharePercent}%)`}
                        style={{
                          width: `${s.sharePercent}%`,
                          backgroundColor: s.brandHex,
                        }}
                        className="h-full"
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {summary.overallStoreShares.map((s) => (
                      <span
                        key={s.storeName}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-200 whitespace-nowrap shrink-0 tabular-nums"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: s.brandHex }}
                        />
                        <span>{s.storeName}</span>
                        <span className="text-zinc-400">
                          {s.sharePercent.toFixed(0)}% · €{s.spend.toFixed(2)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            summary.overallStoreShares.length > 0 && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-mono text-zinc-300 tabular-nums">
                  Total Spend ({formatMonthKeyLabel(selectedMonth)}):{" "}
                  <strong className="text-white">
                    €{summary.overallSpend.toFixed(2)}
                  </strong>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {summary.overallStoreShares.map((s) => (
                    <span
                      key={s.storeName}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300 whitespace-nowrap shrink-0 tabular-nums"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: s.brandHex }}
                      />
                      <span>
                        {s.storeName} {s.sharePercent.toFixed(0)}%
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )
          )}

          {/* Category Targets Grid */}
          {summary.categoryBudgetRows.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {summary.categoryBudgetRows.map((row) => {
                const catColor = categoryColors[row.category] || "#10b981";
                return (
                  <div
                    key={row.category}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: catColor }}
                        />
                        <span className="text-sm font-bold text-white truncate">
                          {row.label}
                        </span>
                      </div>
                      {getStatusBadge(row.status)}
                    </div>

                    <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                      <div>
                        <span className="text-lg font-extrabold text-white">
                          €{row.currentSpend.toFixed(2)}
                        </span>
                        <span className="text-xs text-zinc-400">
                          {" "}
                          / €{row.monthlyTarget.toFixed(2)}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-400">
                        {row.percentUsed.toFixed(1)}%
                      </span>
                    </div>

                    {/* Progress bar with pace marker */}
                    <div className="relative h-2 w-full rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getBarColorClass(
                          row.status
                        )}`}
                        style={{ width: `${Math.min(100, row.percentUsed)}%` }}
                      />
                      {summary.isCurrentMonth &&
                        summary.pacePercent > 0 &&
                        summary.pacePercent < 100 && (
                          <div
                            title={`Month pace: ${summary.pacePercent.toFixed(0)}%`}
                            className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10"
                            style={{ left: `${summary.pacePercent}%` }}
                          />
                        )}
                    </div>

                    <div className="text-[11px] font-mono text-zinc-300 tabular-nums">
                      {row.pacingSummaryText}
                    </div>

                    {/* Per-Category Store Share Breakdown */}
                    {row.storeShares.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-800/70">
                        {row.storeShares.slice(0, 4).map((s) => (
                          <span
                            key={s.storeName}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300 whitespace-nowrap shrink-0 tabular-nums"
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: s.brandHex }}
                            />
                            <span>{s.storeName}</span>
                            <span className="text-zinc-500">
                              {s.sharePercent.toFixed(0)}% (€{s.spend.toFixed(2)})
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Unbudgeted Category Spend Strip */}
          {summary.unbudgetedCategorySpends.length > 0 && (
            <div className="pt-2 border-t border-zinc-800/80 space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                Other Categories Without Targets ({formatMonthKeyLabel(selectedMonth)})
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {summary.unbudgetedCategorySpends.slice(0, 8).map((u) => (
                  <button
                    key={u.category}
                    type="button"
                    onClick={() => openEditor(u.category)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300 hover:border-emerald-500/40 transition-colors whitespace-nowrap shrink-0 tabular-nums"
                    title={`Click to set a monthly budget target for ${u.category}`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: categoryColors[u.category] || "#71717a",
                      }}
                    />
                    <span>{u.category}:</span>
                    <strong className="text-white">€{u.spend.toFixed(2)}</strong>
                    <span className="text-emerald-400 font-semibold">+ Target</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Native <dialog> Budget Editor */}
      <dialog
        ref={editorDialogRef}
        aria-labelledby={editorTitleId}
        className="m-auto w-[calc(100%-1.5rem)] max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-950 text-zinc-100 p-0 shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col max-h-[88vh] overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Target className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h1 id={editorTitleId} className="text-base font-bold text-white truncate">
                  Monthly Spending Targets
                </h1>
                <p className="text-xs text-zinc-400 truncate">
                  Leave blank or 0 to remove a target. Suggestions use your historical monthly average.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => editorDialogRef.current?.close("cancel")}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors whitespace-nowrap shrink-0"
              aria-label="Close budget editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveBudgets} className="flex flex-col flex-1 min-h-0">
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {saveError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  {saveError}
                </div>
              )}

              {/* Overall Target */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="budget-overall"
                    className="text-xs font-bold text-white uppercase font-mono tracking-wider"
                  >
                    Overall Monthly Grocery Budget (€)
                  </label>
                  {summary.historicalCategoryAverages[OVERALL_BUDGET_CATEGORY] > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftValues((prev) => ({
                          ...prev,
                          [OVERALL_BUDGET_CATEGORY]: String(
                            Math.ceil(
                              summary.historicalCategoryAverages[
                                OVERALL_BUDGET_CATEGORY
                              ] / 10
                            ) * 10
                          ),
                        }))
                      }
                      className="text-[11px] font-mono text-emerald-400 hover:underline whitespace-nowrap shrink-0 tabular-nums"
                    >
                      Avg: €
                      {summary.historicalCategoryAverages[
                        OVERALL_BUDGET_CATEGORY
                      ].toFixed(0)}
                      /mo · Use
                    </button>
                  )}
                </div>
                <input
                  id="budget-overall"
                  type="number"
                  min="0"
                  max="100000"
                  step="1"
                  autoFocus
                  value={draftValues[OVERALL_BUDGET_CATEGORY] ?? ""}
                  onChange={(e) =>
                    setDraftValues((prev) => ({
                      ...prev,
                      [OVERALL_BUDGET_CATEGORY]: e.target.value,
                    }))
                  }
                  placeholder="e.g. 400"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-mono font-bold text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>

              {/* Per-Category Targets */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  Category Targets (€ / month)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CANONICAL_CATEGORIES.map((cat) => {
                    const avg = summary.historicalCategoryAverages[cat] || 0;
                    const inputId = `budget-cat-${cat
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")}`;
                    return (
                      <div
                        key={cat}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor={inputId}
                            className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5 truncate"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor: categoryColors[cat] || "#71717a",
                              }}
                            />
                            <span className="truncate">{cat}</span>
                          </label>
                          {avg > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setDraftValues((prev) => ({
                                  ...prev,
                                  [cat]: String(Math.max(5, Math.ceil(avg / 5) * 5)),
                                }))
                              }
                              className="text-[10px] font-mono text-zinc-400 hover:text-emerald-400 whitespace-nowrap shrink-0 tabular-nums"
                            >
                              Avg €{avg.toFixed(0)}
                            </button>
                          )}
                        </div>
                        <input
                          id={inputId}
                          type="number"
                          min="0"
                          max="100000"
                          step="1"
                          value={draftValues[cat] ?? ""}
                          onChange={(e) =>
                            setDraftValues((prev) => ({
                              ...prev,
                              [cat]: e.target.value,
                            }))
                          }
                          placeholder="No cap"
                          className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 tabular-nums"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => editorDialogRef.current?.close("cancel")}
                disabled={isPending}
                className="px-4 py-2 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-xs font-medium text-zinc-300 whitespace-nowrap shrink-0 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                <span>Save Targets</span>
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </section>
  );
}
