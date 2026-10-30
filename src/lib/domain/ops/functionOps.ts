import { rebalancePinned } from "../budget";
import { addDays, daysBetween, formatDisplayDate, resolveWeekday } from "../dates";
import { CAPS, FUNCTION_MAX_OFFSET, FUNCTION_MIN_OFFSET, type EventDoc, type FunctionDoc } from "../model/event";
import { LIMITS } from "../schemas";
import { assertUniqueName, fail, findById, itemOrigin, uniqueId, type ApplyContext } from "./context";
import type { OpOf } from "./schema";

/**
 * Function ops (spec 5.4, 6.3). `sharePercent` is the source of truth; shares are kept in
 * tenths of a percent so they always sum to exactly 100.0, and amounts are re-derived in finalize.
 */

const TENTHS = 1000;

function rebalanceShares(functions: FunctionDoc[], pins: Record<string, number>): void {
  const rows = functions.map((fn) => ({ id: fn.id, amount: Math.round(fn.sharePercent * 10) }));
  const tenthPins = Object.fromEntries(Object.entries(pins).map(([id, share]) => [id, Math.round(share * 10)]));
  const next = rebalancePinned(rows, tenthPins, TENTHS) ?? fail("Shares must add up to 100%");
  functions.forEach((fn, i) => (fn.sharePercent = next[i].amount / 10));
}

/** New function dates must be in [max(today, eventDate - 14), eventDate + 1] (invariant 4). */
function checkFunctionDate(plan: EventDoc, date: string, today: string): void {
  const eventDate = plan.details.eventDate;
  const earliest = addDays(eventDate, FUNCTION_MIN_OFFSET);
  const latest = addDays(eventDate, FUNCTION_MAX_OFFSET);
  if (date < today) fail("Pick a date from today onwards");
  if (date < earliest || date > latest) {
    fail(`Functions must fall between ${formatDisplayDate(earliest)} and ${formatDisplayDate(latest)}`);
  }
}

function checkTimes(start: string | null, end: string | null): void {
  if ((start === null) !== (end === null)) fail("Give both a start and an end time, or neither");
  if (start !== null && end !== null && end <= start) fail("The end time must be after the start time");
}

export function addFunction(plan: EventDoc, op: OpOf<"add_function">, ctx: ApplyContext): void {
  if (plan.functions.length >= CAPS.functions) fail(`An event can have at most ${CAPS.functions} functions`);
  assertUniqueName(
    plan.functions.map((fn) => fn.name),
    op.name,
    "a function",
  );
  const date = op.date ?? addDays(plan.details.eventDate, op.dayOffset ?? 0);
  checkFunctionDate(plan, date, ctx.today);
  const startTime = op.startTime ?? null;
  const endTime = op.endTime ?? null;
  checkTimes(startTime, endTime);

  const first = plan.functions.length === 0;
  const share = first ? 100 : (op.sharePercent ?? Math.round(TENTHS / (plan.functions.length + 1)) / 10);
  const fn: FunctionDoc = {
    id: uniqueId(
      "fn",
      op.name,
      plan.functions.map((f) => f.id),
    ),
    name: op.name,
    date,
    startTime,
    endTime,
    sharePercent: share,
    amount: 0,
    highlights: [],
    origin: itemOrigin(ctx),
  };
  plan.functions.push(fn);
  rebalanceShares(plan.functions, { [fn.id]: share });
  plan.functions.sort((a, b) => a.date.localeCompare(b.date));
}

export function moveFunction(plan: EventDoc, op: OpOf<"move_function">, ctx: ApplyContext): void {
  const fn = findById(plan.functions, op.functionId, "Function");
  const date = op.date ?? (op.weekday ? resolveWeekday(plan.details.eventDate, op.weekday) : fn.date);
  if (date !== fn.date) checkFunctionDate(plan, date, ctx.today);
  const startTime = op.startTime === undefined ? fn.startTime : op.startTime;
  const endTime = op.endTime === undefined ? fn.endTime : op.endTime;
  checkTimes(startTime, endTime);

  // Tasks linked to the function move with it (stored relative, so shift their offset).
  const shift = daysBetween(fn.date, date);
  for (const task of plan.tasks) {
    if (task.functionId !== fn.id || task.pinnedDate !== null) continue;
    task.daysBefore = Math.min(LIMITS.maxPlanningDays, Math.max(LIMITS.minDaysBefore, task.daysBefore - shift));
  }
  Object.assign(fn, { date, startTime, endTime });
  plan.functions.sort((a, b) => a.date.localeCompare(b.date));
}

export function setFunctionShare(plan: EventDoc, op: OpOf<"set_function_share">): void {
  const fn = findById(plan.functions, op.functionId, "Function");
  if (plan.functions.length === 1 && op.percent !== 100) fail("A single function always has 100% of the budget");
  rebalanceShares(plan.functions, { [fn.id]: op.percent });
}

export function renameFunction(plan: EventDoc, op: OpOf<"rename_function">, ctx: ApplyContext): void {
  const fn = findById(plan.functions, op.functionId, "Function");
  assertUniqueName(
    plan.functions.filter((f) => f.id !== fn.id).map((f) => f.name),
    op.name,
    "a function",
  );
  fn.name = op.name;
  fn.origin = itemOrigin(ctx);
}

export function removeFunction(plan: EventDoc, op: OpOf<"remove_function">): void {
  const fn = findById(plan.functions, op.functionId, "Function");
  for (const task of plan.tasks) if (task.functionId === fn.id) task.functionId = null;
  for (const vendor of plan.vendors) vendor.functionIds = vendor.functionIds.filter((id) => id !== fn.id);
  plan.functions = plan.functions.filter((f) => f.id !== fn.id);
  if (plan.functions.length > 0) rebalanceShares(plan.functions, {});
}
