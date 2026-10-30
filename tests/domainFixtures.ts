import { expect } from "vitest";
import { demoFixture } from "@/lib/demo/fixtures";
import { planInvariantViolations } from "@/lib/domain/invariants";
import type { EventDoc } from "@/lib/domain/model/event";
import { applyOperations, type OpResult } from "@/lib/domain/ops/apply";
import type { ApplyContext } from "@/lib/domain/ops/context";
import type { PlanOperation } from "@/lib/domain/ops/schema";

/** "Today" for data-layer tests: the design system's canonical Wednesday. */
export const TODAY = "2026-10-28";

export const USER: ApplyContext = { today: TODAY, actor: "user", now: "2026-10-28T06:00:00.000Z" };
export const AI: ApplyContext = { today: TODAY, actor: "ai", proposalOrigin: "ai", now: "2026-10-28T06:00:00.000Z" };
export const CODE: ApplyContext = { today: TODAY, actor: "ai", proposalOrigin: "code" };

/** The demo wedding (Pune, ₹25,00,000, five functions, 34 tasks, 11 vendors, event on 2026-12-27). */
export function wedding(): EventDoc {
  return demoFixture("wedding", TODAY).event;
}

export function birthday(): EventDoc {
  return demoFixture("birthday", TODAY).event;
}

/** Applies one op and checks that every invariant still holds. */
export function apply(plan: EventDoc, op: PlanOperation, ctx: ApplyContext = USER): { plan: EventDoc; result: OpResult } {
  const outcome = applyOperations(plan, [op], ctx);
  expect(planInvariantViolations(outcome.plan)).toEqual([]);
  return { plan: outcome.plan, result: outcome.results[0] };
}

/** Applies one op that must succeed. */
export function applyOk(plan: EventDoc, op: PlanOperation, ctx: ApplyContext = USER): EventDoc {
  const { plan: next, result } = apply(plan, op, ctx);
  expect(result).toEqual({ ok: true });
  return next;
}

/** Applies one op that must fail, returning its reason; the plan must be unchanged. */
export function rejectReason(plan: EventDoc, op: PlanOperation, ctx: ApplyContext = USER): string {
  const { plan: next, result } = apply(plan, op, ctx);
  expect(result.ok).toBe(false);
  expect(next).toEqual(plan);
  return result.ok ? "" : result.reason;
}

export function lineAmount(plan: EventDoc, id: string): number | undefined {
  return plan.budget.lines.find((line) => line.id === id)?.amount;
}
