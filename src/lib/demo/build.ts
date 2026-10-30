import { addDays } from "@/lib/domain/dates";
import type { IdeaCategory, VendorStatus } from "@/lib/domain/model/enums";
import type { BudgetLineDoc, EventDoc, FunctionDoc, IdeaDoc, IdeaFields, TaskDoc, VendorDoc } from "@/lib/domain/model/event";
import { slugId } from "@/lib/domain/timeline";

/**
 * Compact builders for the demo samples. Everything date-like is relative: functions carry a
 * day offset from the event and timestamps are "days ago" from today, so `resolveDates`
 * keeps every sample current.
 */

export interface DemoClock {
  eventDate: string;
  today: string;
}

/** An ISO timestamp `daysAgo` days before today, at 10:00 IST. */
export function stamp(clock: DemoClock, daysAgo: number): string {
  return `${addDays(clock.today, -daysAgo)}T04:30:00.000Z`;
}

export function line(category: string, amount: number, note = ""): BudgetLineDoc {
  return { id: slugId("line", category), category, amount, percent: 0, note, origin: "ai" };
}

export function fn(
  clock: DemoClock,
  name: string,
  dayOffset: number,
  sharePercent: number,
  times: [string, string] | null = null,
): FunctionDoc {
  return {
    id: slugId("fn", name),
    name,
    date: addDays(clock.eventDate, dayOffset),
    startTime: times?.[0] ?? null,
    endTime: times?.[1] ?? null,
    sharePercent,
    amount: 0,
    highlights: [],
    origin: "ai",
  };
}

export function task(
  clock: DemoClock,
  title: string,
  category: string,
  daysBefore: number,
  options: { doneDaysAgo?: number; functionId?: string } = {},
): TaskDoc {
  const done = options.doneDaysAgo !== undefined;
  return {
    id: slugId("task", title),
    title,
    category,
    daysBefore,
    pinnedDate: null,
    functionId: options.functionId ?? null,
    done,
    doneAt: done ? stamp(clock, options.doneDaysAgo ?? 0) : null,
    origin: "ai",
  };
}

export function vendor(
  clock: DemoClock,
  category: string,
  status: VendorStatus,
  options: {
    lineId?: string;
    functionIds?: string[];
    bookByDaysBefore: number;
    quoted?: number;
    paid?: number;
    questions?: string[];
  },
): VendorDoc {
  const history: VendorDoc["history"] = [{ status: "to_research", at: stamp(clock, 30) }];
  if (status !== "to_research") history.push({ status, at: stamp(clock, 3) });
  return {
    id: slugId("vendor", category),
    category,
    label: "",
    budgetLineId: options.lineId ?? null,
    functionIds: options.functionIds ?? [],
    bookByDaysBefore: options.bookByDaysBefore,
    status,
    quotedAmount: options.quoted ?? null,
    paidAmount: options.paid ?? 0,
    notes: "",
    contact: "",
    questions: options.questions ?? [],
    history,
    drafts: [],
    origin: "ai",
  };
}

export function idea(
  title: string,
  description: string,
  category: IdeaCategory,
  estimatedCost: number | null,
  basis: string[],
  extra: Partial<Pick<IdeaFields, "costBasis" | "effort">> = {},
): IdeaDoc {
  return {
    id: slugId("idea", title),
    title,
    description,
    category,
    estimatedCost,
    costBasis: extra.costBasis ?? "per event",
    basis,
    effort: extra.effort ?? "mixed",
    state: "saved",
    origin: "ai",
    source: "ai",
  };
}

type EventParts = Pick<EventDoc, "details" | "summary" | "budget" | "functions" | "tasks" | "vendors" | "ideas" | "guests"> &
  Partial<Pick<EventDoc, "honorees" | "flags">>;

/** Wraps sample content in a complete event document; `finalizePlan` then derives the rest. */
export function demoEvent(clock: DemoClock, parts: EventParts): EventDoc {
  return {
    ownerUid: "demo",
    version: 1,
    schemaVersion: 1,
    status: "active",
    source: "ai",
    dismissedIdeaTitles: [],
    honorees: [],
    flags: { kids: false, elderly: false, mobility: false },
    review: null,
    warnings: [],
    share: { active: false, tokenHash: null, showAmounts: true, showNotes: false },
    stats: {
      tasksDone: 0,
      tasksTotal: 0,
      openDueDates: [],
      vendorsByStatus: { to_research: 0, contacted: 0, quoted: 0, booked: 0, paid: 0, not_needed: 0 },
      committed: 0,
      pending: { count: 0, expireAt: null },
    },
    createdAt: stamp(clock, 30),
    updatedAt: stamp(clock, 0),
    ...parts,
  };
}
