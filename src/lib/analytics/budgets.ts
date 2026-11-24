export const OVERALL_BUDGET_CATEGORY = "__OVERALL__";

export interface UserBudgetTarget {
  category: string; // "__OVERALL__" or canonical category
  monthlyTarget: number;
}

export interface BudgetReceiptInput {
  id: string;
  purchaseDate: string;
  totalAmount: number;
  store: {
    name: string;
    slug: string;
    brandHex: string;
  };
}

export interface BudgetItemInput {
  id: string;
  receiptId: string;
  purchaseDate: string;
  storeName: string;
  storeSlug?: string;
  storeBrandHex: string;
  category: string;
  totalPrice: number;
  isDiscount?: boolean;
  excluded?: boolean;
}

export interface StoreShareEntry {
  storeName: string;
  storeSlug: string;
  brandHex: string;
  spend: number;
  receiptCount: number;
  sharePercent: number;
}

export type BudgetStatus = "on_track" | "caution" | "over_budget";

export interface BudgetProgressRow {
  category: string;
  label: string;
  monthlyTarget: number;
  currentSpend: number;
  projectedSpend: number;
  remaining: number;
  dailyAllowanceRemaining: number;
  percentUsed: number;
  projectedPercent: number;
  status: BudgetStatus;
  pacingSummaryText: string;
  storeShares: StoreShareEntry[];
}

export interface AvailableBudgetMonth {
  key: string;
  label: string;
  isCurrent: boolean;
  receiptCount: number;
}

export interface UnbudgetedCategorySpend {
  category: string;
  spend: number;
  sharePercent: number;
  storeShares: StoreShareEntry[];
}

export interface MonthlyBudgetSummary {
  monthKey: string;
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;
  pacePercent: number;
  isCurrentMonth: boolean;
  isPastMonth: boolean;
  overallSpend: number;
  overallBudgetRow: BudgetProgressRow | null;
  categoryBudgetRows: BudgetProgressRow[];
  overallStoreShares: StoreShareEntry[];
  unbudgetedCategorySpends: UnbudgetedCategorySpend[];
  historicalCategoryAverages: Record<string, number>;
}

/**
 * Extracts a YYYY-MM month key in UTC/ISO format from a Date or ISO date string.
 */
export function getMonthKey(date: Date | string): string {
  if (date instanceof Date) {
    return date.toISOString().slice(0, 7);
  }
  const trimmed = String(date).trim();
  if (/^\d{4}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 7);
  }
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 7);
  }
  return parsed.toISOString().slice(0, 7);
}

/**
 * Formats a YYYY-MM key into a readable month label (e.g. "Nov 2026").
 */
export function formatMonthKeyLabel(monthKey: string): string {
  const [yStr, mStr] = monthKey.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  if (!year || !month || month < 1 || month > 12) return monthKey;
  const d = new Date(Date.UTC(year, month - 1, 15));
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getDaysInMonth(year: number, monthIndex1Based: number): number {
  return new Date(Date.UTC(year, monthIndex1Based, 0)).getUTCDate();
}

/**
 * Returns sorted list of selectable months (always includes current calendar month + all months with receipts).
 */
export function getAvailableBudgetMonths(
  receipts: BudgetReceiptInput[],
  now: Date = new Date()
): AvailableBudgetMonth[] {
  const currentKey = getMonthKey(now);
  const counts = new Map<string, number>();
  counts.set(currentKey, 0);

  for (const r of receipts) {
    const key = getMonthKey(r.purchaseDate);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, receiptCount]) => ({
      key,
      label: formatMonthKeyLabel(key),
      isCurrent: key === currentKey,
      receiptCount,
    }));
}

function buildStoreShares(
  entries: Array<{
    storeName: string;
    storeSlug: string;
    brandHex: string;
    spend: number;
    receiptId: string;
  }>
): StoreShareEntry[] {
  const map = new Map<
    string,
    {
      storeName: string;
      storeSlug: string;
      brandHex: string;
      spend: number;
      receiptIds: Set<string>;
    }
  >();

  let total = 0;
  for (const e of entries) {
    if (e.spend <= 0) continue;
    total += e.spend;
    const key = e.storeName;
    const prev = map.get(key) || {
      storeName: e.storeName,
      storeSlug: e.storeSlug || e.storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      brandHex: e.brandHex || "#10b981",
      spend: 0,
      receiptIds: new Set<string>(),
    };
    prev.spend += e.spend;
    prev.receiptIds.add(e.receiptId);
    map.set(key, prev);
  }

  return Array.from(map.values())
    .map((s) => ({
      storeName: s.storeName,
      storeSlug: s.storeSlug,
      brandHex: s.brandHex,
      spend: Number(s.spend.toFixed(2)),
      receiptCount: s.receiptIds.size,
      sharePercent: total > 0 ? Number(((s.spend / total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.spend - a.spend);
}

function buildProgressRow(params: {
  category: string;
  label: string;
  monthlyTarget: number;
  currentSpend: number;
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;
  isCurrentMonth: boolean;
  isPastMonth: boolean;
  storeShares: StoreShareEntry[];
}): BudgetProgressRow {
  const {
    category,
    label,
    monthlyTarget,
    currentSpend,
    daysInMonth,
    daysElapsed,
    daysRemaining,
    isCurrentMonth,
    isPastMonth,
    storeShares,
  } = params;

  const cleanSpend = Number(Math.max(0, currentSpend).toFixed(2));
  const cleanTarget = Number(monthlyTarget.toFixed(2));

  let projectedSpend = cleanSpend;
  if (isCurrentMonth) {
    const safeElapsed = Math.max(1, daysElapsed);
    projectedSpend = Number(((cleanSpend / safeElapsed) * daysInMonth).toFixed(2));
  } else if (!isPastMonth) {
    projectedSpend = 0;
  }

  const remaining = Number((cleanTarget - cleanSpend).toFixed(2));
  const dailyAllowanceRemaining =
    isCurrentMonth && daysRemaining > 0
      ? Number((Math.max(0, remaining) / daysRemaining).toFixed(2))
      : 0;

  const percentUsed =
    cleanTarget > 0 ? Number(((cleanSpend / cleanTarget) * 100).toFixed(1)) : 0;
  const projectedPercent =
    cleanTarget > 0 ? Number(((projectedSpend / cleanTarget) * 100).toFixed(1)) : 0;

  let status: BudgetStatus = "on_track";
  if (cleanSpend > cleanTarget) {
    status = "over_budget";
  } else if (isCurrentMonth && projectedSpend > cleanTarget * 1.05) {
    status = "caution";
  }

  let pacingSummaryText: string;
  if (isPastMonth) {
    if (cleanSpend > cleanTarget) {
      pacingSummaryText = `Exceeded €${cleanTarget.toFixed(2)} budget by €${(
        cleanSpend - cleanTarget
      ).toFixed(2)}`;
    } else {
      pacingSummaryText = `Final €${cleanSpend.toFixed(2)} vs. €${cleanTarget.toFixed(
        2
      )} budget`;
    }
  } else if (!isCurrentMonth) {
    pacingSummaryText = `Target €${cleanTarget.toFixed(2)} for upcoming month`;
  } else if (cleanSpend === 0) {
    pacingSummaryText = `€0.00 spent so far vs. €${cleanTarget.toFixed(2)} budget`;
  } else if (cleanSpend > cleanTarget) {
    pacingSummaryText = `Over budget by €${(cleanSpend - cleanTarget).toFixed(
      2
    )} (on pace for €${projectedSpend.toFixed(2)})`;
  } else if (projectedSpend <= cleanTarget) {
    pacingSummaryText = `On track for €${projectedSpend.toFixed(
      2
    )} vs. €${cleanTarget.toFixed(2)} budget`;
  } else {
    pacingSummaryText = `On pace for €${projectedSpend.toFixed(
      2
    )} vs. €${cleanTarget.toFixed(2)} budget (+€${(
      projectedSpend - cleanTarget
    ).toFixed(2)} projected)`;
  }

  return {
    category,
    label,
    monthlyTarget: cleanTarget,
    currentSpend: cleanSpend,
    projectedSpend,
    remaining,
    dailyAllowanceRemaining,
    percentUsed,
    projectedPercent,
    status,
    pacingSummaryText,
    storeShares,
  };
}

/**
 * Computes monthly category & overall budget progress, end-of-month pacing projections,
 * store-share breakdowns, and historical monthly category averages from confirmed receipts.
 */
export function computeMonthlyBudgetSummary(params: {
  receipts: BudgetReceiptInput[];
  items: BudgetItemInput[];
  budgets: UserBudgetTarget[];
  monthKey?: string;
  now?: Date;
}): MonthlyBudgetSummary {
  const now = params.now ?? new Date();
  const currentMonthKey = getMonthKey(now);
  const monthKey = params.monthKey || currentMonthKey;

  const [yStr, mStr] = monthKey.split("-");
  const year = Number(yStr) || now.getUTCFullYear();
  const month1Based = Number(mStr) || now.getUTCMonth() + 1;
  const daysInMonth = getDaysInMonth(year, month1Based);

  const isCurrentMonth = monthKey === currentMonthKey;
  const isPastMonth = monthKey < currentMonthKey;

  const daysElapsed = isCurrentMonth
    ? Math.min(daysInMonth, Math.max(1, now.getUTCDate()))
    : isPastMonth
    ? daysInMonth
    : 0;
  const daysRemaining = isCurrentMonth ? Math.max(0, daysInMonth - daysElapsed) : 0;
  const pacePercent =
    daysInMonth > 0 ? Number(((daysElapsed / daysInMonth) * 100).toFixed(1)) : 0;

  // Filter receipts and items in the selected month
  const monthReceipts = params.receipts.filter(
    (r) => getMonthKey(r.purchaseDate) === monthKey
  );
  const monthItems = params.items.filter(
    (i) =>
      !i.excluded &&
      !i.isDiscount &&
      getMonthKey(i.purchaseDate) === monthKey
  );

  // Overall spend: prefer printed receipt totals; fall back to sum of active items if receipt totals are 0
  const receiptSum = monthReceipts.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
  const itemsSum = monthItems.reduce((sum, i) => sum + (Number(i.totalPrice) || 0), 0);
  const overallSpend = Number((receiptSum > 0 ? receiptSum : itemsSum).toFixed(2));

  // Overall store share breakdown
  const overallStoreShares = buildStoreShares(
    monthReceipts.length > 0 && receiptSum > 0
      ? monthReceipts.map((r) => ({
          storeName: r.store.name,
          storeSlug: r.store.slug,
          brandHex: r.store.brandHex,
          spend: Number(r.totalAmount) || 0,
          receiptId: r.id,
        }))
      : monthItems.map((i) => ({
          storeName: i.storeName,
          storeSlug: i.storeSlug || "",
          brandHex: i.storeBrandHex,
          spend: Number(i.totalPrice) || 0,
          receiptId: i.receiptId,
        }))
  );

  // Group month items by category
  const catSpendMap = new Map<string, number>();
  const catStoreEntries = new Map<
    string,
    Array<{
      storeName: string;
      storeSlug: string;
      brandHex: string;
      spend: number;
      receiptId: string;
    }>
  >();

  for (const item of monthItems) {
    const cat = item.category || "Other";
    const spend = Math.max(0, Number(item.totalPrice) || 0);
    catSpendMap.set(cat, (catSpendMap.get(cat) || 0) + spend);

    const list = catStoreEntries.get(cat) || [];
    list.push({
      storeName: item.storeName,
      storeSlug: item.storeSlug || "",
      brandHex: item.storeBrandHex,
      spend,
      receiptId: item.receiptId,
    });
    catStoreEntries.set(cat, list);
  }

  // Overall budget row
  const overallTargetObj = params.budgets.find(
    (b) => b.category === OVERALL_BUDGET_CATEGORY && b.monthlyTarget > 0
  );
  const overallBudgetRow = overallTargetObj
    ? buildProgressRow({
        category: OVERALL_BUDGET_CATEGORY,
        label: "Overall Monthly Grocery Budget",
        monthlyTarget: overallTargetObj.monthlyTarget,
        currentSpend: overallSpend,
        daysInMonth,
        daysElapsed,
        daysRemaining,
        isCurrentMonth,
        isPastMonth,
        storeShares: overallStoreShares,
      })
    : null;

  // Category budget rows
  const budgetedCategories = new Set<string>();
  const categoryBudgetRows: BudgetProgressRow[] = params.budgets
    .filter((b) => b.category !== OVERALL_BUDGET_CATEGORY && b.monthlyTarget > 0)
    .map((b) => {
      budgetedCategories.add(b.category);
      const spend = catSpendMap.get(b.category) || 0;
      const storeShares = buildStoreShares(catStoreEntries.get(b.category) || []);
      return buildProgressRow({
        category: b.category,
        label: b.category,
        monthlyTarget: b.monthlyTarget,
        currentSpend: spend,
        daysInMonth,
        daysElapsed,
        daysRemaining,
        isCurrentMonth,
        isPastMonth,
        storeShares,
      });
    })
    .sort((a, b) => {
      // Over budget and caution first, then by current spend descending
      if (b.percentUsed !== a.percentUsed) return b.percentUsed - a.percentUsed;
      return b.currentSpend - a.currentSpend;
    });

  // Unbudgeted categories that had spend in this month
  const totalCategoryItemSpend = Array.from(catSpendMap.values()).reduce((s, v) => s + v, 0);
  const unbudgetedCategorySpends: UnbudgetedCategorySpend[] = Array.from(catSpendMap.entries())
    .filter(([cat, spend]) => !budgetedCategories.has(cat) && spend > 0)
    .map(([category, spend]) => ({
      category,
      spend: Number(spend.toFixed(2)),
      sharePercent:
        totalCategoryItemSpend > 0
          ? Number(((spend / totalCategoryItemSpend) * 100).toFixed(1))
          : 0,
      storeShares: buildStoreShares(catStoreEntries.get(category) || []),
    }))
    .sort((a, b) => b.spend - a.spend);

  // Historical monthly averages across all months with data (for DB-driven budget suggestions)
  const activeMonths = new Set<string>();
  for (const r of params.receipts) {
    activeMonths.add(getMonthKey(r.purchaseDate));
  }
  const totalMonthsCount = Math.max(1, activeMonths.size);
  const historicalCatTotals = new Map<string, number>();
  let historicalOverallTotal = 0;

  for (const r of params.receipts) {
    historicalOverallTotal += Number(r.totalAmount) || 0;
  }
  for (const item of params.items) {
    if (item.excluded || item.isDiscount) continue;
    const cat = item.category || "Other";
    historicalCatTotals.set(
      cat,
      (historicalCatTotals.get(cat) || 0) + Math.max(0, Number(item.totalPrice) || 0)
    );
  }

  const historicalCategoryAverages: Record<string, number> = {
    [OVERALL_BUDGET_CATEGORY]: Number((historicalOverallTotal / totalMonthsCount).toFixed(2)),
  };
  for (const [cat, total] of historicalCatTotals.entries()) {
    historicalCategoryAverages[cat] = Number((total / totalMonthsCount).toFixed(2));
  }

  return {
    monthKey,
    daysInMonth,
    daysElapsed,
    daysRemaining,
    pacePercent,
    isCurrentMonth,
    isPastMonth,
    overallSpend,
    overallBudgetRow,
    categoryBudgetRows,
    overallStoreShares,
    unbudgetedCategorySpends,
    historicalCategoryAverages,
  };
}
