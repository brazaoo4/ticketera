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
import {
  formatCurrency,
  formatWholeCurrency,
  formatPercent,
  getStoreBrand,
} from "@/lib/format";

interface MonthlyBudgetsSectionProps {
  receipts: BudgetReceiptInput[];
  items: BudgetItemInput[];
  initialBudgets: UserBudgetTarget[];
  categoryColors: Record<string, string>;
}

function getStatusBadge(status: BudgetProgressRow["status"]) {
  if (status === "over_budget") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--negative-tint)] text-[var(--negative)] border border-[var(--negative)]/30 text-[13px] font-semibold whitespace-nowrap shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>Over budget</span>
      </span>
    );
  }
  if (status === "caution") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--accent-tint)] text-[var(--accent)] border border-[var(--accent)]/30 text-[13px] font-semibold whitespace-nowrap shrink-0">
        <TrendingUp className="w-3.5 h-3.5 shrink-0" />
        <span>Pacing high</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--positive-tint)] text-[var(--positive)] border border-[var(--positive)]/30 text-[13px] font-semibold whitespace-nowrap shrink-0">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
      <span>On track</span>
    </span>
  );
}

function getBarColorClass(status: BudgetProgressRow["status"]): string {
  if (status === "over_budget") return "bg-[var(--negative)]";
  if (status === "caution") return "bg-[var(--accent)]";
  return "bg-[var(--positive)]";
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
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div className="space-y-1">
          <h2 className="font-display text-[20px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Target className="w-5 h-5 text-[var(--primary)] shrink-0" />
            <span>Monthly budgets &amp; pacing</span>
          </h2>
          <p className="text-[13px] text-[var(--text-muted)]">
            Track monthly spending targets, end-of-month pacing projections, and
            supermarket share.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Month Selector */}
          <div className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-[var(--bg-page)] border border-[var(--border)] text-[13px]">
            <Calendar className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
            <select
              aria-label="Select budget month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-[var(--text-primary)] font-medium tabular-nums focus:outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option
                  key={m.key}
                  value={m.key}
                  className="bg-[var(--bg-card)] text-[var(--text-primary)]"
                >
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
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] font-semibold text-[13px] whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>{hasAnyTargets ? "Edit budgets" : "Set budgets"}</span>
          </button>
        </div>
      </div>

      {/* Empty month helper when current month has 0 spend but past months have receipts */}
      {summary.overallSpend === 0 &&
        latestWithReceiptsKey &&
        latestWithReceiptsKey !== selectedMonth && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
            <span className="text-[var(--text-muted)]">
              No confirmed receipts recorded yet for{" "}
              <strong className="text-[var(--text-primary)]">
                {formatMonthKeyLabel(selectedMonth)}
              </strong>
              .
            </span>
            <button
              type="button"
              onClick={() => setSelectedMonth(latestWithReceiptsKey)}
              className="h-8 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] text-[var(--primary)] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              View {formatMonthKeyLabel(latestWithReceiptsKey)} →
            </button>
          </div>
        )}

      {/* Overall Summary + Overall Budget Card */}
      {!hasAnyTargets ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-page)]/60 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--primary)]">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{formatMonthKeyLabel(selectedMonth)} snapshot</span>
            </div>
            <div className="font-display text-2xl font-bold text-[var(--text-primary)] tabular-nums">
              {formatCurrency(summary.overallSpend)}{" "}
              <span className="text-[13px] font-sans font-normal text-[var(--text-muted)]">
                spent in {formatMonthKeyLabel(selectedMonth)}
              </span>
            </div>
            <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
              Set an overall monthly grocery budget or category targets (such as
              Dairy &amp; Eggs, Meat &amp; Poultry, or Produce) to monitor
              pacing and store share.
            </p>
          </div>

          <button
            type="button"
            onClick={() => openEditor()}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] font-semibold text-[13px] whitespace-nowrap shrink-0 self-start md:self-auto transition-colors cursor-pointer"
          >
            <Target className="w-4 h-4 shrink-0" />
            <span>Set monthly budgets</span>
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Overall Target Card (or Monthly Spend + Store Share Summary) */}
          {summary.overallBudgetRow ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-page)]/50 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-[var(--text-muted)]">
                      Overall monthly target ({formatMonthKeyLabel(selectedMonth)})
                    </span>
                    {getStatusBadge(summary.overallBudgetRow.status)}
                  </div>
                  <div className="flex items-baseline gap-2 tabular-nums">
                    <span className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
                      {formatCurrency(summary.overallBudgetRow.currentSpend)}
                    </span>
                    <span className="text-[14px] text-[var(--text-muted)]">
                      / {formatCurrency(summary.overallBudgetRow.monthlyTarget)}
                    </span>
                    <span className="text-[13px] text-[var(--text-muted)]">
                      (
                      {formatPercent(summary.overallBudgetRow.percentUsed, {
                        showPlus: false,
                      })}
                      )
                    </span>
                  </div>
                </div>

                <div className="text-left sm:text-right space-y-1 text-[13px]">
                  <div
                    className={`font-semibold ${
                      summary.overallBudgetRow.status === "over_budget"
                        ? "text-[var(--negative)]"
                        : summary.overallBudgetRow.status === "caution"
                        ? "text-[var(--accent)]"
                        : "text-[var(--positive)]"
                    }`}
                  >
                    {summary.overallBudgetRow.pacingSummaryText}
                  </div>
                  {summary.isCurrentMonth && (
                    <div className="text-[13px] text-[var(--text-muted)] tabular-nums">
                      Day {summary.daysElapsed} of {summary.daysInMonth} (
                      {formatPercent(summary.pacePercent, {
                        decimals: 0,
                        showPlus: false,
                      })}{" "}
                      of month) ·{" "}
                      {summary.overallBudgetRow.remaining >= 0
                        ? `${formatCurrency(
                            summary.overallBudgetRow.dailyAllowanceRemaining
                          )}/day left`
                        : `${formatCurrency(
                            Math.abs(summary.overallBudgetRow.remaining)
                          )} over`}
                    </div>
                  )}
                </div>
              </div>

              {/* Progress bar with vertical pace tick */}
              <div className="relative h-3 w-full rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${getBarColorClass(
                    summary.overallBudgetRow.status
                  )}`}
                  style={{
                    width: `${Math.min(100, summary.overallBudgetRow.percentUsed)}%`,
                  }}
                />
                {summary.isCurrentMonth &&
                  summary.pacePercent > 0 &&
                  summary.pacePercent < 100 && (
                    <div
                      title={`Month pace: ${formatPercent(summary.pacePercent, {
                        decimals: 0,
                        showPlus: false,
                      })}`}
                      className="absolute top-0 bottom-0 w-0.5 bg-[var(--text-primary)]/70 z-10"
                      style={{ left: `${summary.pacePercent}%` }}
                    />
                  )}
              </div>

              {/* Store-Share Breakdown Bar */}
              {summary.overallStoreShares.length > 0 && (
                <div className="pt-3 border-t border-[var(--border)] space-y-2">
                  <div className="flex items-center justify-between text-[13px] text-[var(--text-muted)]">
                    <span>
                      Supermarket share ({formatMonthKeyLabel(selectedMonth)})
                    </span>
                    <span className="tabular-nums">
                      {summary.overallStoreShares.length}{" "}
                      {summary.overallStoreShares.length === 1
                        ? "store"
                        : "stores"}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden flex">
                    {summary.overallStoreShares.map((s) => {
                      const brand = getStoreBrand(s.storeName, s.brandHex);
                      return (
                        <div
                          key={s.storeName}
                          title={`${s.storeName}: ${formatCurrency(
                            s.spend
                          )} (${formatPercent(s.sharePercent, {
                            decimals: 0,
                            showPlus: false,
                          })})`}
                          style={{
                            width: `${s.sharePercent}%`,
                            backgroundColor: brand.color,
                          }}
                          className="h-full"
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {summary.overallStoreShares.map((s) => {
                      const brand = getStoreBrand(s.storeName, s.brandHex);
                      return (
                        <span
                          key={s.storeName}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[13px] text-[var(--text-primary)] whitespace-nowrap shrink-0 tabular-nums"
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: brand.color }}
                          />
                          <span>{s.storeName}</span>
                          <span className="text-[var(--text-muted)]">
                            {formatPercent(s.sharePercent, {
                              decimals: 0,
                              showPlus: false,
                            })}{" "}
                            · {formatCurrency(s.spend)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            summary.overallStoreShares.length > 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-page)]/50 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[13px] text-[var(--text-muted)] tabular-nums">
                  Total spend ({formatMonthKeyLabel(selectedMonth)}):{" "}
                  <strong className="text-[var(--text-primary)] font-semibold">
                    {formatCurrency(summary.overallSpend)}
                  </strong>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {summary.overallStoreShares.map((s) => {
                    const brand = getStoreBrand(s.storeName, s.brandHex);
                    return (
                      <span
                        key={s.storeName}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[13px] text-[var(--text-primary)] whitespace-nowrap shrink-0 tabular-nums"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: brand.color }}
                        />
                        <span>
                          {s.storeName}{" "}
                          {formatPercent(s.sharePercent, {
                            decimals: 0,
                            showPlus: false,
                          })}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {/* Category Targets Grid */}
          {summary.categoryBudgetRows.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {summary.categoryBudgetRows.map((row) => {
                const catColor = categoryColors[row.category] || "#15803D";
                return (
                  <div
                    key={row.category}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg-page)]/50 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: catColor }}
                        />
                        <span className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
                          {row.label}
                        </span>
                      </div>
                      {getStatusBadge(row.status)}
                    </div>

                    <div className="flex items-baseline justify-between gap-2 tabular-nums">
                      <div>
                        <span className="font-display text-lg font-bold text-[var(--text-primary)]">
                          {formatCurrency(row.currentSpend)}
                        </span>
                        <span className="text-[13px] text-[var(--text-muted)]">
                          {" "}
                          / {formatCurrency(row.monthlyTarget)}
                        </span>
                      </div>
                      <span className="text-[13px] text-[var(--text-muted)]">
                        {formatPercent(row.percentUsed, { showPlus: false })}
                      </span>
                    </div>

                    {/* Progress bar with pace marker */}
                    <div className="relative h-2 w-full rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-300 ${getBarColorClass(
                          row.status
                        )}`}
                        style={{
                          width: `${Math.min(100, row.percentUsed)}%`,
                        }}
                      />
                      {summary.isCurrentMonth &&
                        summary.pacePercent > 0 &&
                        summary.pacePercent < 100 && (
                          <div
                            title={`Month pace: ${formatPercent(
                              summary.pacePercent,
                              { decimals: 0, showPlus: false }
                            )}`}
                            className="absolute top-0 bottom-0 w-0.5 bg-[var(--text-primary)]/70 z-10"
                            style={{ left: `${summary.pacePercent}%` }}
                          />
                        )}
                    </div>

                    <div className="text-[13px] text-[var(--text-muted)] tabular-nums">
                      {row.pacingSummaryText}
                    </div>

                    {/* Per-Category Store Share Breakdown */}
                    {row.storeShares.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--border)]">
                        {row.storeShares.slice(0, 4).map((s) => {
                          const brand = getStoreBrand(s.storeName, s.brandHex);
                          return (
                            <span
                              key={s.storeName}
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[13px] text-[var(--text-primary)] whitespace-nowrap shrink-0 tabular-nums"
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: brand.color }}
                              />
                              <span>{s.storeName}</span>
                              <span className="text-[var(--text-muted)]">
                                {formatPercent(s.sharePercent, {
                                  decimals: 0,
                                  showPlus: false,
                                })}{" "}
                                ({formatCurrency(s.spend)})
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Unbudgeted Category Spend Strip */}
          {summary.unbudgetedCategorySpends.length > 0 && (
            <div className="pt-3 border-t border-[var(--border)] space-y-2.5">
              <div className="text-[13px] font-medium text-[var(--text-muted)]">
                Categories without targets ({formatMonthKeyLabel(selectedMonth)})
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {summary.unbudgetedCategorySpends.slice(0, 8).map((u) => (
                  <button
                    key={u.category}
                    type="button"
                    onClick={() => openEditor(u.category)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--bg-page)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[13px] text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
                    title={`Set a monthly target for ${u.category}`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          categoryColors[u.category] || "#64748B",
                      }}
                    />
                    <span className="text-[var(--text-muted)]">
                      {u.category}:
                    </span>
                    <strong className="font-semibold">
                      {formatCurrency(u.spend)}
                    </strong>
                    <span className="text-[var(--primary)] font-semibold">
                      + Target
                    </span>
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
        className="m-auto w-[calc(100%-1.5rem)] max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] p-0 shadow-2xl backdrop:bg-[var(--scrim)] backdrop:backdrop-blur-[2px]"
      >
        <div className="flex flex-col max-h-[88vh] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[var(--primary-tint)] border border-[var(--primary)]/25 text-[var(--primary)] flex items-center justify-center shrink-0">
                <Target className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2
                  id={editorTitleId}
                  className="font-display font-semibold text-[18px] text-[var(--text-primary)] truncate"
                >
                  Monthly spending targets
                </h2>
                <p className="text-[13px] text-[var(--text-muted)] truncate">
                  Leave blank or 0 to remove a target. Suggestions match your
                  monthly average.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => editorDialogRef.current?.close("cancel")}
              className="w-8 h-8 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] inline-flex items-center justify-center transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="Close budget editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form
            onSubmit={handleSaveBudgets}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {saveError && (
                <div className="p-3.5 rounded-xl bg-[var(--negative-tint)] border border-[var(--negative)]/30 text-[13px] text-[var(--negative)]">
                  {saveError}
                </div>
              )}

              {/* Overall Target */}
              <div className="rounded-2xl border border-[var(--primary)]/30 bg-[var(--primary-tint)]/55 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="budget-overall"
                    className="text-[13px] font-semibold text-[var(--text-primary)]"
                  >
                    Overall monthly grocery budget (€)
                  </label>
                  {summary.historicalCategoryAverages[OVERALL_BUDGET_CATEGORY] >
                    0 && (
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
                      className="text-[13px] font-medium text-[var(--primary)] hover:underline whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
                    >
                      Avg{" "}
                      {formatWholeCurrency(
                        summary.historicalCategoryAverages[
                          OVERALL_BUDGET_CATEGORY
                        ]
                      )}
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
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[14px] font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] tabular-nums"
                />
              </div>

              {/* Per-Category Targets */}
              <div className="space-y-2.5">
                <div className="text-[13px] font-medium text-[var(--text-muted)]">
                  Category targets (€ / month)
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
                        className="rounded-xl border border-[var(--border)] bg-[var(--bg-page)]/50 p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor={inputId}
                            className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5 truncate"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor:
                                  categoryColors[cat] || "#64748B",
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
                                  [cat]: String(
                                    Math.max(5, Math.ceil(avg / 5) * 5)
                                  ),
                                }))
                              }
                              className="text-[13px] text-[var(--text-muted)] hover:text-[var(--primary)] whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
                            >
                              Avg {formatWholeCurrency(avg)}
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
                          className="w-full h-9 px-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] tabular-nums"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--bg-page)]/60 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => editorDialogRef.current?.close("cancel")}
                disabled={isPending}
                className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isPending && (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                )}
                <span>Save targets</span>
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </section>
  );
}
