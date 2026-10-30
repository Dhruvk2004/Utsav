import { formatCount, formatInr } from "@/lib/domain/budget";
import { formatWeekdayDate } from "@/lib/domain/dates";
import { FESTIVAL_LABELS } from "@/lib/domain/festivals";
import { defaultEventTitle, OCCASION_LABELS } from "@/lib/domain/labels";
import type { EventType } from "@/lib/domain/schemas";
import type { EventDoc } from "@/lib/domain/model/event";
import type { PlanView } from "@/lib/domain/view";
import type { DemoSample } from "@/lib/demo/resolveDates";
import { countdownText } from "./eventCard";

/** Workspace tabs, their links and the AI mode example chips (spec 3.2, 10.6-10.12, design-system 9.3). */

export const WORKSPACE_TABS = ["overview", "budget", "timeline", "vendors", "ideas", "guests"] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

/** The demo has no Guests tab (spec 3.1). */
export const DEMO_TABS: readonly WorkspaceTab[] = WORKSPACE_TABS.filter((tab) => tab !== "guests");

export const TAB_LABELS: Record<WorkspaceTab, string> = {
  overview: "Overview",
  budget: "Budget",
  timeline: "Timeline",
  vendors: "Vendors",
  ideas: "Ideas",
  guests: "Guests",
};

/** Birthday and community samples open on Ideas, where personalisation shows best (spec 10.19). */
export const DEMO_DEFAULT_TAB: Record<DemoSample, WorkspaceTab> = { wedding: "overview", birthday: "ideas", community: "ideas" };

export const DEMO_TITLES: Record<DemoSample, string> = {
  wedding: "Sample wedding",
  birthday: "Sample 6th birthday",
  community: "Sample Diwali celebration",
};

export function parseTab(value: string | null | undefined, allowed: readonly WorkspaceTab[], fallback: WorkspaceTab): WorkspaceTab {
  return allowed.find((tab) => tab === value) ?? fallback;
}

/** Workspace tabs are real routes: `/events/{id}` for Overview, `/events/{id}/{tab}` for the rest. */
export function workspaceTabHref(eventId: string, tab: WorkspaceTab): string {
  const base = `/events/${encodeURIComponent(eventId)}`;
  return tab === "overview" ? base : `${base}/${tab}`;
}

/** Demo tabs are query-param views of one static page. */
export const eventSettingsHref = (eventId: string) => `/events/${encodeURIComponent(eventId)}/settings`;

export function demoTabHref(sample: DemoSample, tab: WorkspaceTab): string {
  return `/demo/${sample}?tab=${tab}`;
}

/** Each sample's recorded instruction leads its chips (design-system 9.3). */
export const DEMO_CHIP: Record<DemoSample, string> = {
  wedding: "Cut decor spend by 20%",
  birthday: "Add a painting station",
  community: "Add volunteer tasks for the event day",
};

/**
 * The instructions each sample has a recording for: the only chips offered when the demo has no
 * live AI (MQR-03). A unit test keeps them equal to the recordings' instructions.
 */
export const DEMO_RECORDED_CHIPS: Record<DemoSample, readonly string[]> = {
  wedding: [DEMO_CHIP.wedding, "Make that 15% instead"],
  birthday: [DEMO_CHIP.birthday],
  community: [DEMO_CHIP.community],
};

type ChipPlan = Pick<EventDoc, "details" | "budget" | "functions" | "guests" | "vendors">;

const NOUNS: Record<EventType, string> = {
  wedding: "wedding",
  birthday: "party",
  anniversary: "anniversary",
  community: "event",
  other: "event",
};

/** A task and a vendor that fit each kind of event (CO-05). */
function typeChips({ details }: ChipPlan): { task: string; vendor: string } {
  switch (details.eventType) {
    case "wedding":
      return { task: "Add a task to book the mehndi artist", vendor: "Add a photo booth" };
    case "birthday":
      return { task: "Add a task to order the return gifts", vendor: "Add a magician" };
    case "anniversary":
      return { task: "Add a task to order the cake", vendor: "Add a live band" };
    case "community":
      return details.occasion === "diwali"
        ? { task: "Add a task to buy 2,000 diyas", vendor: "Add a rangoli artist" }
        : { task: "Add a task to recruit volunteers", vendor: "Add a sound and lighting vendor" };
    default:
      return { task: "Add a task to order the cake", vendor: "Add a photographer" };
  }
}

const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/**
 * Example chips per tab (design-system 9.3), built from the event itself so a society Diwali never
 * offers "Move the sangeet" (CO-05). Each maps to one AI tool or one code-computed fact; a sample
 * puts its recorded instruction first.
 */
export function chipsFor(tab: WorkspaceTab, plan: ChipPlan, sample?: DemoSample): string[] {
  const { details, budget, functions, guests, vendors } = plan;
  const noun = NOUNS[details.eventType];
  const people = details.eventType === "community" ? "residents" : "guests";
  const more = `We're now ${formatCount(roundTo(guests.total * 1.1, 5))} ${people}`;
  const lines = budget.lines.filter((line) => line.category.toLowerCase() !== "contingency");
  const decor = lines.find((line) => /decor/i.test(line.category)) ?? lines[0];
  const biggest = [...lines].filter((line) => line !== decor).sort((a, b) => b.amount - a.amount)[0];
  const moveFunction = functions.length > 1 ? `Move the ${functions[0].name.toLowerCase()} to Friday` : `Push the ${noun} back by a week`;
  const vendor = vendors.find((v) => v.category.toLowerCase() !== "venue")?.category.toLowerCase() ?? "caterer";
  const { task, vendor: addVendor } = typeChips(plan);
  const occasion = details.occasion && details.occasion !== "other" ? OCCASION_LABELS[details.occasion] : null;

  const chips: Record<WorkspaceTab, string[]> = {
    overview: ["What's overdue?", moveFunction, addVendor, more],
    budget: [
      decor ? `Cut ${decor.category.toLowerCase()} spend by 20%` : "Cut the biggest category by 10%",
      decor && biggest
        ? `Move ${formatInr(roundTo(decor.amount * 0.1, 1000))} from ${decor.category} to ${biggest.category}`
        : "What's the biggest category?",
      `Keep the total under ${formatInr(roundTo(budget.total * 0.95, 1000))}`,
      "What's left to pay?",
    ],
    timeline: [moveFunction, task, "What's overdue?", `Push the ${noun} back by a week`],
    vendors: [addVendor, `Add a note to the ${vendor}: wants 50% advance`, `Add questions for the ${vendor}`, "What's left to pay?"],
    ideas: [
      "Ideas for elderly guests",
      "Cheaper decor ideas",
      guests.kids ? `Something for ${formatCount(guests.kids)} kids` : "Something for the kids",
      occasion ? `Ideas that fit ${occasion}` : `Ideas that fit the ${noun}`,
    ],
    guests: [
      more,
      `We have ${formatCount(roundTo(guests.total * 0.1, 1))} elderly ${people}`,
      `We're now ${formatCount(guests.total)} ${people}, ${formatCount(roundTo(guests.total * 0.2, 1))} of them kids`,
      "What's left to pay?",
    ],
  };
  const list = [...new Set(chips[tab])];
  if (!sample) return list.slice(0, 4);
  return [DEMO_CHIP[sample], ...list.filter((chip) => chip !== DEMO_CHIP[sample])].slice(0, 4);
}

export interface HeaderMeta {
  title: string;
  date: string;
  countdown: string;
  festival: string | null;
  city: string;
  guests: string;
  budget: string;
}

export function headerMeta(plan: EventDoc, view: PlanView, today: string): HeaderMeta {
  const { details } = plan;
  const festival = view.festival;
  const away = Math.abs(festival?.daysAway ?? 0);
  const festivalText = !festival
    ? null
    : away === 0
      ? `On ${FESTIVAL_LABELS[festival.festival]}`
      : `${away} ${away === 1 ? "day" : "days"} ${festival.daysAway > 0 ? "before" : "after"} ${FESTIVAL_LABELS[festival.festival]}`;
  const people = details.eventType === "community" ? "residents" : "guests";
  return {
    title: details.title || defaultEventTitle(details),
    date: formatWeekdayDate(details.eventDate),
    countdown: countdownText(details.eventDate, today),
    festival: festivalText,
    city: details.city,
    guests: `${formatCount(plan.guests.total)} ${people}`,
    budget: formatInr(plan.budget.total),
  };
}

/** The Vendors tab badge counts active vendors (status other than Not needed). */
export function activeVendorCount(plan: EventDoc): number {
  return plan.vendors.filter((vendor) => vendor.status !== "not_needed").length;
}
