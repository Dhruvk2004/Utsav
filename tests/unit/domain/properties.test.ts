import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { demoFixture } from "@/lib/demo/fixtures";
import { DEMO_SAMPLES } from "@/lib/demo/resolveDates";
import { allocate, rebalancePinned } from "@/lib/domain/budget";
import { addDays, WEEKDAYS } from "@/lib/domain/dates";
import { planInvariantViolations } from "@/lib/domain/invariants";
import { VENDOR_STATUSES } from "@/lib/domain/model/enums";
import type { EventDoc } from "@/lib/domain/model/event";
import { applyOperations } from "@/lib/domain/ops/apply";
import type { ApplyContext } from "@/lib/domain/ops/context";
import { isProposable, type PlanOperation } from "@/lib/domain/ops/schema";
import { SandboxPlanStore } from "@/lib/plan/SandboxPlanStore";

/**
 * Property tests (spec 12.4): random op sequences over the demo samples keep invariants 1-12,
 * including function amounts following shares (3), references after removals (11) and guest
 * flags after mixed set_guests / set_personalisation (12).
 */

const RUNS = 1_000;
/** Long op sequences at 1,000 runs need more than the default 5 s on a loaded CI runner. */
const TIMEOUT_MS = 120_000;
const TODAY = "2026-10-28";
const KINDS = [
  "set_total_budget",
  "set_budget_lines",
  "adjust_budget_category",
  "add_budget_category",
  "rename_budget_category",
  "remove_budget_category",
  "add_function",
  "move_function",
  "set_function_share",
  "remove_function",
  "add_task",
  "update_task",
  "remove_task",
  "add_vendor",
  "update_vendor",
  "set_vendor_status",
  "remove_vendor",
  "add_idea",
  "remove_idea",
  "set_guests",
  "set_personalisation",
  "set_details",
  "reset_section",
] as const;
const NAMES = ["Decor", "Puja", "Extra", "Sangeet", "venue", "Tea", "Contingency"];

const seedArb = fc.record({
  kind: fc.constantFrom(...KINDS),
  i: fc.nat(60),
  j: fc.nat(60),
  n: fc.integer({ min: -1_000_000, max: 1_000_000 }),
  p: fc.integer({ min: 0, max: 100 }),
  flag: fc.boolean(),
  actor: fc.constantFrom("user", "ai", "code"),
});
type Seed = typeof seedArb extends fc.Arbitrary<infer T> ? T : never;

const pick = <T>(items: T[], index: number): T | undefined => (items.length ? items[index % items.length] : undefined);
const idOf = (items: { id: string }[], index: number) => pick(items, index)?.id ?? "missing";

/** Builds a schema-valid op aimed at the current plan, so most ops apply and some are rejected. */
function materialise(plan: EventDoc, s: Seed): PlanOperation {
  const name = `${pick(NAMES, s.i)}${s.flag ? "" : ` ${s.j % 3}`}`;
  const lines = plan.budget.lines;
  const amount = Math.abs(s.n) % 300_000;
  switch (s.kind) {
    case "set_total_budget":
      return { type: s.kind, total: Math.max(1_000, plan.budget.total + s.n), strategy: "rescale" };
    case "set_budget_lines": {
      const rows = lines.map((l, k) => ({ lineId: l.id, amount: k === s.i % lines.length ? amount : l.amount }));
      return {
        type: s.kind,
        lines: s.flag
          ? rows
          : rows
              .slice(1)
              .concat(rows.slice(0, 1))
              .slice(0, Math.max(1, rows.length - (s.j % 2))),
      };
    }
    case "adjust_budget_category": {
      const mode = (["percent_change", "set_amount", "change_amount"] as const)[s.j % 3];
      const value = mode === "percent_change" ? s.p - 50 : mode === "set_amount" ? amount : s.n % 300_000;
      const rebalance = (["change_total", "spread_to_others", "to_contingency"] as const)[s.i % 3];
      return { type: s.kind, lineId: idOf(lines, s.i), mode, value, rebalance };
    }
    case "add_budget_category":
      return { type: s.kind, category: name, amount, fundFrom: (["contingency", "spread", "increase_total"] as const)[s.j % 3] };
    case "rename_budget_category":
      return { type: s.kind, lineId: idOf(lines, s.i), category: name };
    case "remove_budget_category":
      return { type: s.kind, lineId: idOf(lines, s.i), moveToLineId: s.flag ? undefined : idOf(lines, s.j) };
    case "add_function":
      return {
        type: s.kind,
        name,
        dayOffset: (s.i % 16) - 14,
        sharePercent: s.flag ? s.p : undefined,
        startTime: s.flag ? "10:00" : undefined,
        endTime: s.flag ? "12:30" : undefined,
      };
    case "move_function":
      return s.flag
        ? { type: s.kind, functionId: idOf(plan.functions, s.i), weekday: WEEKDAYS[s.j % 7] }
        : { type: s.kind, functionId: idOf(plan.functions, s.i), date: addDays(plan.details.eventDate, (s.j % 16) - 14) };
    case "set_function_share":
      return { type: s.kind, functionId: idOf(plan.functions, s.i), percent: s.p };
    case "remove_function":
      return { type: s.kind, functionId: idOf(plan.functions, s.i) };
    case "add_task":
      return {
        type: s.kind,
        title: `${name} task`,
        category: "General",
        daysBefore: (Math.abs(s.n) % 738) - 7,
        functionId: s.flag ? idOf(plan.functions, s.j) : null,
      };
    case "update_task":
      return s.flag
        ? { type: s.kind, taskId: idOf(plan.tasks, s.i), done: s.j % 2 === 0 }
        : { type: s.kind, taskId: idOf(plan.tasks, s.i), date: addDays(TODAY, s.j) };
    case "remove_task":
      return { type: s.kind, taskId: idOf(plan.tasks, s.i) };
    case "add_vendor":
      return {
        type: s.kind,
        category: name,
        budgetLineId: s.flag ? idOf(lines, s.j) : null,
        functionIds: s.flag && plan.functions.length ? [idOf(plan.functions, s.i)] : [],
        bookByDaysBefore: s.p,
      };
    case "update_vendor":
      return {
        type: s.kind,
        vendorId: idOf(plan.vendors, s.i),
        patch: s.flag ? { budgetLineId: idOf(lines, s.j) } : { functionIds: plan.functions.slice(0, s.j % 3).map((f) => f.id) },
      };
    case "set_vendor_status":
      return {
        type: s.kind,
        vendorId: idOf(plan.vendors, s.i),
        status: VENDOR_STATUSES[s.j % VENDOR_STATUSES.length],
        quotedAmount: s.flag ? amount : undefined,
        paidAmount: s.p % 3 === 0 ? s.p * 100 : undefined,
      };
    case "remove_vendor":
      return { type: s.kind, vendorId: idOf(plan.vendors, s.i) };
    case "add_idea":
      return {
        type: s.kind,
        idea: {
          title: `${name} idea`,
          description: "",
          category: "decor",
          estimatedCost: null,
          costBasis: "per event",
          basis: [],
          effort: "diy",
        },
      };
    case "remove_idea":
      return { type: s.kind, ideaId: idOf(plan.ideas, s.i), dismiss: s.flag };
    case "set_guests": {
      const total = (Math.abs(s.n) % 800) + 1;
      return { type: s.kind, guests: { total, kids: s.flag ? s.p : null, elderly: s.j % 2 ? s.j : null, adults: null } };
    }
    case "set_personalisation":
      return { type: s.kind, flags: { kids: s.flag, elderly: s.j % 2 === 0, mobility: s.flag } };
    case "set_details":
      return { type: s.kind, eventDate: addDays(TODAY, Math.abs(s.n) % 700) };
    case "reset_section":
      return { type: s.kind, section: (["budget", "timeline", "vendors", "ideas"] as const)[s.j % 4] };
  }
}

function contextFor(actor: Seed["actor"]): ApplyContext {
  if (actor === "user") return { today: TODAY, actor: "user" };
  return { today: TODAY, actor: "ai", proposalOrigin: actor === "code" ? "code" : "ai" };
}

describe("applyOperations properties", () => {
  it(
    "keeps invariants 1-12 after any sequence of ops",
    () => {
      fc.assert(
        fc.property(fc.constantFrom(...DEMO_SAMPLES), fc.array(seedArb, { minLength: 5, maxLength: 20 }), (sample, seeds) => {
          let plan = demoFixture(sample, TODAY).event;
          for (const seed of seeds) {
            plan = applyOperations(plan, [materialise(plan, seed)], contextFor(seed.actor)).plan;
            expect(planInvariantViolations(plan)).toEqual([]);
            expect(plan.functions.map((f) => f.amount)).toEqual(
              allocate(
                plan.budget.total,
                plan.functions.map((f) => f.sharePercent),
              ),
            );
          }
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT_MS,
  );

  it(
    "replaying a sandbox's accepted ops on the pristine sample gives the same plan",
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(seedArb, { minLength: 3, maxLength: 12 }), async (seeds) => {
          const pristine = demoFixture("wedding", TODAY).event;
          const store = new SandboxPlanStore(pristine, TODAY);
          for (const seed of seeds) {
            const op = materialise(store.getPlan(), seed);
            if (isProposable(op)) await store.applyManual([op]);
          }
          const replay = applyOperations(pristine, [...store.appliedOps], { today: TODAY, actor: "user" });
          expect(replay.results.every((r) => r.ok)).toBe(true);
          expect(replay.plan).toEqual(store.getPlan());
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT_MS,
  );
});

describe("budget maths properties", () => {
  it("allocate always sums exactly to the total in whole rupees", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.array(fc.double({ min: 0, max: 1_000, noNaN: true }), { minLength: 1, maxLength: 20 }),
        (total, weights) => {
          const parts = allocate(total, weights);
          expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
          expect(parts.every((p) => Number.isInteger(p) && p >= 0)).toBe(true);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("What-if edited After values always rebalance to the new total", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(1_000_000), { minLength: 2, maxLength: 20 }),
        fc.integer({ min: 1_000, max: 50_000_000 }),
        fc.nat(19),
        fc.nat(2_000_000),
        (amounts, total, row, after) => {
          const rows = amounts.map((amount, k) => ({ id: `r${k}`, amount }));
          const pinned = rows[row % rows.length].id;
          const result = rebalancePinned(rows, { [pinned]: after }, total);
          if (after > total) expect(result).toBeNull();
          else {
            expect(result?.reduce((sum, r) => sum + r.amount, 0)).toBe(total);
            expect(result?.find((r) => r.id === pinned)?.amount).toBe(after);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });
});
