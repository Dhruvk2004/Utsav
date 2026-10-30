import type { BudgetLine } from "./schemas";

/**
 * Splits `total` into whole-rupee amounts proportional to `weights` using the
 * largest-remainder method, so the parts always add up to exactly `total`.
 */
export function allocate(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total) || total < 0) throw new RangeError("total must be a non-negative integer");
  if (weights.length === 0) return [];
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  // With no usable weights, fall back to an even split.
  const shares = sum === 0 ? safe.map(() => 1 / safe.length) : safe.map((w) => w / sum);

  const exact = shares.map((s) => s * total);
  const floored = exact.map(Math.floor);
  let remainder = total - floored.reduce((a, b) => a + b, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of order) {
    if (remainder === 0) break;
    floored[index] += 1;
    remainder -= 1;
  }
  return floored;
}

/** Rounds a percentage to one decimal place for display. */
export function percentOf(amount: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((amount / total) * 1000) / 10;
}

/** Merges duplicate categories (case-insensitive) by summing their weights. */
export function mergeCategories<T extends { category: string; percent: number; note: string }>(items: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of items) {
    const key = item.category.trim().toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, {
        ...existing,
        percent: existing.percent + item.percent,
        note: [existing.note, item.note].filter(Boolean).join("; "),
      });
    } else {
      merged.set(key, { ...item, category: item.category.trim() });
    }
  }
  return [...merged.values()];
}

export function buildBudgetLines(total: number, items: { category: string; percent: number; note: string }[]): BudgetLine[] {
  const merged = mergeCategories(items);
  const amounts = allocate(
    total,
    merged.map((i) => i.percent),
  );
  return merged.map((item, i) => ({
    category: item.category,
    note: item.note,
    amount: amounts[i],
    percent: percentOf(amounts[i], total),
  }));
}

/** Instantly rescales an existing breakdown to a new total, keeping its proportions. */
export function rescaleBudget(lines: BudgetLine[], newTotal: number): BudgetLine[] {
  const amounts = allocate(
    newTotal,
    lines.map((l) => l.amount),
  );
  return lines.map((line, i) => ({ ...line, amount: amounts[i], percent: percentOf(amounts[i], newTotal) }));
}

/**
 * Sets the pinned rows to their new amounts and spreads what is left of `total` over the
 * other rows in proportion to their current amounts, so the rows always sum to `total`.
 * Returns null when that is impossible (pins exceed the total, or every row is pinned
 * and the pins do not add up to it).
 */
export function rebalancePinned<T extends { id: string; amount: number }>(
  rows: T[],
  pins: Readonly<Record<string, number>>,
  total: number,
): T[] | null {
  const pinned = rows.filter((row) => row.id in pins);
  const free = rows.filter((row) => !(row.id in pins));
  const rest = total - pinned.reduce((sum, row) => sum + pins[row.id], 0);
  if (rest < 0 || (free.length === 0 && rest !== 0)) return null;
  const spread = allocate(
    rest,
    free.map((row) => row.amount),
  );
  let next = 0;
  return rows.map((row) => ({ ...row, amount: row.id in pins ? pins[row.id] : spread[next++] }));
}

export function sumAmounts(lines: { amount: number }[]): number {
  return lines.reduce((a, l) => a + l.amount, 0);
}

/** A count with Indian digit grouping: 5000 -> "5,000", 150000 -> "1,50,000" (QA-06). */
export function formatCount(count: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(count);
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export type BudgetChange = {
  category: string;
  before: number;
  after: number;
  delta: number;
  status: "added" | "removed" | "changed" | "unchanged";
};

/** Compares two breakdowns category by category, for the what-if view. */
export function diffBudgets(before: BudgetLine[], after: BudgetLine[]): BudgetChange[] {
  const key = (c: string) => c.trim().toLowerCase();
  const beforeMap = new Map(before.map((l) => [key(l.category), l]));
  const afterMap = new Map(after.map((l) => [key(l.category), l]));
  const changes: BudgetChange[] = [];

  for (const line of after) {
    const prev = beforeMap.get(key(line.category));
    const beforeAmount = prev?.amount ?? 0;
    const delta = line.amount - beforeAmount;
    changes.push({
      category: line.category,
      before: beforeAmount,
      after: line.amount,
      delta,
      status: !prev ? "added" : delta === 0 ? "unchanged" : "changed",
    });
  }
  for (const line of before) {
    if (!afterMap.has(key(line.category))) {
      changes.push({ category: line.category, before: line.amount, after: 0, delta: -line.amount, status: "removed" });
    }
  }
  return changes;
}
