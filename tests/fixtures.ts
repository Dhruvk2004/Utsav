import { buildPlan } from "@/lib/domain/planner";
import { eventInputSchema, type AiPlanDraft, type EventInput, type EventPlan } from "@/lib/domain/schemas";

export const TODAY = "2026-11-01";

export function makeInput(overrides: Partial<EventInput> = {}): EventInput {
  return eventInputSchema.parse({
    eventType: "wedding",
    title: "Riya & Arjun",
    eventDate: "2027-02-14",
    city: "Jaipur",
    guestCount: 300,
    budget: 1_500_000,
    vibe: "Royal Rajasthani, marigold and pink",
    functions: ["Mehndi", "Sangeet", "Wedding"],
    language: "en",
    ...overrides,
  });
}

export function makeDraft(overrides: Partial<AiPlanDraft> = {}): AiPlanDraft {
  return {
    summary: "A royal three-day Jaipur wedding.",
    budget: [
      { category: "Venue", percent: 30, note: "Heritage haveli" },
      { category: "Catering", percent: 35, note: "" },
      { category: "Decor", percent: 20, note: "Marigold drapes" },
      { category: "Contingency", percent: 15, note: "" },
    ],
    functions: [
      { name: "Mehndi", dayOffset: -2, percent: 20, highlights: ["Rajasthani folk music"] },
      { name: "Sangeet", dayOffset: -1, percent: 30, highlights: ["Family dance-off"] },
      { name: "Wedding", dayOffset: 0, percent: 50, highlights: [] },
    ],
    tasks: [
      { title: "Book the venue", category: "Venue", daysBefore: 90 },
      { title: "Send invitations", category: "Guests", daysBefore: 30 },
      { title: "Final headcount", category: "Food", daysBefore: 5 },
      { title: "Settle payments", category: "Budget", daysBefore: 0 },
    ],
    vendors: [
      { category: "Caterer", bookByDaysBefore: 60, questions: ["Is tasting included?"], budgetCategory: "Catering" },
      { category: "Decorator", bookByDaysBefore: 45, questions: [], budgetCategory: null },
    ],
    ideas: [
      {
        title: "Puppet show welcome",
        description: "Kathputli artists greet guests.",
        estimatedCost: 25000,
        category: "entertainment",
        basis: ["Vibe: royal Rajasthani"],
      },
    ],
    ...overrides,
  };
}

export function makePlan(inputOverrides: Partial<EventInput> = {}, draftOverrides: Partial<AiPlanDraft> = {}): EventPlan {
  return buildPlan(makeInput(inputOverrides), makeDraft(draftOverrides), {
    today: TODAY,
    source: "ai",
    now: new Date("2026-11-01T10:00:00Z"),
  });
}
