import test from "node:test";
import assert from "node:assert/strict";
import {
  OVERALL_BUDGET_CATEGORY,
  computeMonthlyBudgetSummary,
  getAvailableBudgetMonths,
  getMonthKey,
  type BudgetItemInput,
  type BudgetReceiptInput,
  type UserBudgetTarget,
} from "../src/lib/analytics/budgets";

const SAMPLE_RECEIPTS: BudgetReceiptInput[] = [
  {
    id: "r1",
    purchaseDate: "2026-11-05T10:00:00Z",
    totalAmount: 100,
    store: { name: "Mercadona", slug: "mercadona", brandHex: "#00754A" },
  },
  {
    id: "r2",
    purchaseDate: "2026-11-12T10:00:00Z",
    totalAmount: 50,
    store: { name: "Lidl", slug: "lidl", brandHex: "#0050AA" },
  },
  {
    id: "r3",
    purchaseDate: "2026-10-18T10:00:00Z",
    totalAmount: 240,
    store: { name: "Mercadona", slug: "mercadona", brandHex: "#00754A" },
  },
];

const SAMPLE_ITEMS: BudgetItemInput[] = [
  {
    id: "i1",
    receiptId: "r1",
    purchaseDate: "2026-11-05T10:00:00Z",
    storeName: "Mercadona",
    storeSlug: "mercadona",
    storeBrandHex: "#00754A",
    category: "Dairy & Eggs",
    totalPrice: 40,
  },
  {
    id: "i2",
    receiptId: "r1",
    purchaseDate: "2026-11-05T10:00:00Z",
    storeName: "Mercadona",
    storeSlug: "mercadona",
    storeBrandHex: "#00754A",
    category: "Meat & Poultry",
    totalPrice: 60,
  },
  {
    id: "i3",
    receiptId: "r2",
    purchaseDate: "2026-11-12T10:00:00Z",
    storeName: "Lidl",
    storeSlug: "lidl",
    storeBrandHex: "#0050AA",
    category: "Dairy & Eggs",
    totalPrice: 20,
  },
  {
    id: "i4",
    receiptId: "r2",
    purchaseDate: "2026-11-12T10:00:00Z",
    storeName: "Lidl",
    storeSlug: "lidl",
    storeBrandHex: "#0050AA",
    category: "Fruits & Vegetables",
    totalPrice: 30,
  },
  {
    id: "i5",
    receiptId: "r2",
    purchaseDate: "2026-11-12T10:00:00Z",
    storeName: "Lidl",
    storeSlug: "lidl",
    storeBrandHex: "#0050AA",
    category: "Dairy & Eggs",
    totalPrice: 99,
    excluded: true,
  },
  {
    id: "i6",
    receiptId: "r3",
    purchaseDate: "2026-10-18T10:00:00Z",
    storeName: "Mercadona",
    storeSlug: "mercadona",
    storeBrandHex: "#00754A",
    category: "Dairy & Eggs",
    totalPrice: 90,
  },
];

const SAMPLE_BUDGETS: UserBudgetTarget[] = [
  { category: OVERALL_BUDGET_CATEGORY, monthlyTarget: 400 },
  { category: "Dairy & Eggs", monthlyTarget: 80 },
  { category: "Meat & Poultry", monthlyTarget: 50 },
];

test("getMonthKey and getAvailableBudgetMonths include current month and sort descending", () => {
  assert.equal(getMonthKey("2026-11-15T12:00:00Z"), "2026-11");
  const months = getAvailableBudgetMonths(
    SAMPLE_RECEIPTS,
    new Date("2026-12-01T10:00:00Z")
  );
  assert.equal(months[0].key, "2026-12");
  assert.equal(months[0].isCurrent, true);
  assert.equal(months[0].receiptCount, 0);
  assert.equal(months[1].key, "2026-11");
  assert.equal(months[1].receiptCount, 2);
  assert.equal(months[2].key, "2026-10");
});

test("computeMonthlyBudgetSummary projects mid-month pacing, statuses, and store shares", () => {
  // Nov 2026 has 30 days; mid-month day 15 => 50% elapsed
  const summary = computeMonthlyBudgetSummary({
    receipts: SAMPLE_RECEIPTS,
    items: SAMPLE_ITEMS,
    budgets: SAMPLE_BUDGETS,
    monthKey: "2026-11",
    now: new Date("2026-11-15T12:00:00Z"),
  });

  assert.equal(summary.daysInMonth, 30);
  assert.equal(summary.daysElapsed, 15);
  assert.equal(summary.daysRemaining, 15);
  assert.equal(summary.pacePercent, 50);
  assert.equal(summary.overallSpend, 150);

  // Overall: €150 spent on day 15/30 => projected €300 vs €400 budget => on_track
  assert.ok(summary.overallBudgetRow);
  assert.equal(summary.overallBudgetRow.projectedSpend, 300);
  assert.equal(summary.overallBudgetRow.status, "on_track");
  assert.equal(summary.overallBudgetRow.remaining, 250);
  assert.match(summary.overallBudgetRow.pacingSummaryText, /On track for €300\.00 vs\. €400\.00 budget/);

  // Store shares for overall Nov: Mercadona €100 (66.7%), Lidl €50 (33.3%)
  assert.equal(summary.overallStoreShares.length, 2);
  assert.equal(summary.overallStoreShares[0].storeName, "Mercadona");
  assert.equal(summary.overallStoreShares[0].sharePercent, 66.7);
  assert.equal(summary.overallStoreShares[1].storeName, "Lidl");
  assert.equal(summary.overallStoreShares[1].sharePercent, 33.3);

  // Dairy & Eggs: €40 + €20 = €60 (excluded item ignored) => projected €120 vs €80 => caution
  const dairy = summary.categoryBudgetRows.find((r) => r.category === "Dairy & Eggs");
  assert.ok(dairy);
  assert.equal(dairy.currentSpend, 60);
  assert.equal(dairy.projectedSpend, 120);
  assert.equal(dairy.status, "caution");
  assert.equal(dairy.storeShares[0].storeName, "Mercadona");
  assert.equal(dairy.storeShares[0].sharePercent, 66.7);

  // Meat & Poultry: €60 vs €50 budget => over_budget
  const meat = summary.categoryBudgetRows.find((r) => r.category === "Meat & Poultry");
  assert.ok(meat);
  assert.equal(meat.status, "over_budget");
  assert.equal(meat.remaining, -10);

  // Unbudgeted categories: Fruits & Vegetables €30
  assert.equal(summary.unbudgetedCategorySpends.length, 1);
  assert.equal(summary.unbudgetedCategorySpends[0].category, "Fruits & Vegetables");
  assert.equal(summary.unbudgetedCategorySpends[0].spend, 30);
});

test("computeMonthlyBudgetSummary handles completed past months and day-1 edge cases without NaN", () => {
  const pastSummary = computeMonthlyBudgetSummary({
    receipts: SAMPLE_RECEIPTS,
    items: SAMPLE_ITEMS,
    budgets: SAMPLE_BUDGETS,
    monthKey: "2026-10",
    now: new Date("2026-11-15T12:00:00Z"),
  });
  assert.equal(pastSummary.isPastMonth, true);
  assert.equal(pastSummary.isCurrentMonth, false);
  assert.equal(pastSummary.overallBudgetRow?.projectedSpend, 240);
  assert.equal(pastSummary.overallBudgetRow?.status, "on_track");
  assert.match(pastSummary.overallBudgetRow?.pacingSummaryText || "", /Final €240\.00 vs\. €400\.00 budget/);

  const dairyPast = pastSummary.categoryBudgetRows.find((r) => r.category === "Dairy & Eggs");
  assert.equal(dairyPast?.status, "over_budget");

  // Day 1 of month should divide by 1, never 0
  const day1Summary = computeMonthlyBudgetSummary({
    receipts: [
      {
        id: "r-day1",
        purchaseDate: "2026-12-01T08:00:00Z",
        totalAmount: 20,
        store: { name: "Mercadona", slug: "mercadona", brandHex: "#00754A" },
      },
    ],
    items: [],
    budgets: [{ category: OVERALL_BUDGET_CATEGORY, monthlyTarget: 400 }],
    monthKey: "2026-12",
    now: new Date("2026-12-01T09:00:00Z"),
  });
  assert.equal(day1Summary.daysElapsed, 1);
  assert.equal(day1Summary.overallBudgetRow?.projectedSpend, 620);
  assert.equal(day1Summary.overallBudgetRow?.status, "caution");
});
