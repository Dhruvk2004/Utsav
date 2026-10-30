import type { EventDoc, HonoreeDoc, VendorDoc } from "@/lib/domain/model/event";
import type { PlanProfile } from "@/lib/domain/model/user";
import { ageBand, budgetTier, costBand, seasonOf } from "@/lib/domain/personalisation";
import { deriveView } from "@/lib/domain/view";

/**
 * What the model may see of a plan (spec 6.3-6.6, 7.1, 9.4). Every projection is built field by
 * field, so the event title, honoree names and notes, vendor labels, contacts and vendor notes
 * can never reach a prompt: none of these functions read them.
 */

export type AiProfile = Pick<PlanProfile, "role" | "budgetStyle">;

/** The nearest tasks the instruct context lists (spec 6.3). */
export const MAX_CONTEXT_TASKS = 60;

const occasionOf = (plan: EventDoc) => (plan.details.occasion === "other" ? plan.details.occasionOther || "other" : plan.details.occasion);

/** Honorees by role, age, gender and interests only; a birthday's milestone stands in for a missing age (7.1). */
export function honoreesOf(plan: EventDoc): Pick<HonoreeDoc, "role" | "age" | "gender" | "interests">[] {
  return plan.honorees.map(({ role, age, gender, interests }) => ({
    role,
    age: age ?? (plan.details.eventType === "birthday" && role === "birthday_child" ? plan.details.milestone : null),
    gender: gender === "undisclosed" ? null : gender,
    interests,
  }));
}

function detailsOf(plan: EventDoc) {
  const { eventType, milestone, eventDate, city, language, vibe, theme, tradition, traditionOther, dietary } = plan.details;
  return { eventType, occasion: occasionOf(plan), milestone, eventDate, city, language, vibe, theme, tradition, traditionOther, dietary };
}

/** Code-computed figures the model must quote instead of doing sums (spec 6.3 `facts`). */
export function factsOf(plan: EventDoc, today: string) {
  const view = deriveView(plan, today);
  return {
    total: plan.budget.total,
    committed: view.money.committed,
    paid: view.money.paid,
    quotedAwaiting: view.money.quotedOpen,
    remaining: view.money.remaining,
    tasksOverdue: view.tasks.filter((task) => task.overdue).length,
    tasksDone: view.progress.done,
    tasksTotal: view.progress.total,
    daysToGo: view.daysToGo,
    festival: view.festival,
  };
}

/** The compact plan for AI mode (spec 6.3). */
export function instructContext(plan: EventDoc, today: string) {
  const view = deriveView(plan, today);
  return {
    today,
    details: detailsOf(plan),
    budget: plan.budget.lines.map(({ id, category, amount, percent, note }) => ({ id, category, amount, percent, note })),
    functions: plan.functions.map(({ id, name, date, startTime, endTime, sharePercent }) => ({
      id,
      name,
      date,
      startTime,
      endTime,
      sharePercent,
    })),
    tasks: view.tasks.slice(0, MAX_CONTEXT_TASKS).map(({ id, title, category, dueDate, done }) => ({ id, title, category, dueDate, done })),
    vendors: plan.vendors.map(({ id, category, status, quotedAmount, paidAmount }) => ({ id, category, status, quotedAmount, paidAmount })),
    ideas: plan.ideas.map(({ id, title, state }) => ({ id, title, state })),
    guests: { total: plan.guests.total, kids: plan.guests.kids, elderly: plan.guests.elderly },
    personalisation: { honorees: honoreesOf(plan), guestsInclude: plan.flags },
    facts: factsOf(plan, today),
  };
}

/** The inputs that drive ideas (spec 6.5, 7.1), with the derived season, lead time and spend tier. */
export function ideasContext(plan: EventDoc, profile: AiProfile | null, today: string) {
  const view = deriveView(plan, today);
  const perGuest = Math.round(plan.budget.total / Math.max(1, plan.guests.total));
  return {
    details: detailsOf(plan),
    functions: plan.functions.map((fn) => fn.name),
    date: {
      month: Number(plan.details.eventDate.slice(5, 7)),
      season: seasonOf(plan.details.eventDate),
      leadTimeDays: view.daysToGo,
      festival: view.festival,
    },
    city: { name: plan.details.city, costBand: costBand(plan.details.city) },
    guests: { total: plan.guests.total, kids: plan.guests.kids, elderly: plan.guests.elderly, flags: plan.flags },
    budget: { total: plan.budget.total, perGuest, tier: budgetTier(perGuest) },
    honorees: honoreesOf(plan).map((h) => ({ ...h, ageBand: h.age === null ? null : ageBand(h.age) })),
    profile: { role: profile?.role ?? null, budgetStyle: profile?.budgetStyle ?? null },
    existingIdeaTitles: plan.ideas.map((idea) => idea.title),
    dismissedIdeaTitles: plan.dismissedIdeaTitles,
  };
}

/** What-if (spec 6.4): the categories to re-weight, with committed amounts, and what is protected. */
export function whatifContext(plan: EventDoc, newTotal: number, protect: string[], today: string) {
  const view = deriveView(plan, today);
  return {
    eventType: plan.details.eventType,
    occasion: occasionOf(plan),
    guests: plan.guests.total,
    currentTotal: plan.budget.total,
    newTotal,
    categories: plan.budget.lines.map((line) => ({
      category: line.category,
      percent: line.percent,
      committed: view.moneyByLine.get(line.id)?.committed ?? 0,
      protected: protect.includes(line.id),
    })),
    functions: plan.functions.map(({ name, sharePercent }) => ({ name, sharePercent })),
  };
}

/** Enquiry drafts (spec 6.6): never the vendor's label, contact or notes, and never the user's name. */
export function enquiryContext(plan: EventDoc, vendor: VendorDoc, options: { questions: string[]; includeBudget: boolean }) {
  const linked = plan.functions.filter((fn) => vendor.functionIds.includes(fn.id));
  const line = plan.budget.lines.find((l) => l.id === vendor.budgetLineId);
  return {
    vendorCategory: vendor.category,
    eventType: plan.details.eventType,
    occasion: occasionOf(plan),
    eventDate: plan.details.eventDate,
    functions: linked.map(({ name, date, startTime, endTime }) => ({ name, date, startTime, endTime })),
    city: plan.details.city,
    guestCount: plan.guests.total,
    tradition: plan.details.tradition,
    traditionOther: plan.details.traditionOther,
    questions: options.questions,
    budget: options.includeBudget && line ? line.amount : null,
  };
}
