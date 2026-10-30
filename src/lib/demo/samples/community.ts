import type { EventDoc } from "@/lib/domain/model/event";
import type { PlanProfile } from "@/lib/domain/model/user";
import { demoEvent, idea, line, task, vendor, type DemoClock } from "../build";

/** A residents' association Diwali celebration in Chennai, run by volunteers (spec 5.10, 7.2). */
export const communityProfile: PlanProfile = { role: "community", budgetStyle: "simple", language: "en" };

export function buildCommunity(clock: DemoClock): EventDoc {
  const t = (title: string, category: string, daysBefore: number, options?: Parameters<typeof task>[4]) =>
    task(clock, title, category, daysBefore, options);

  return demoEvent(clock, {
    details: {
      eventType: "community",
      title: "Sample residents' association Diwali",
      occasion: "diwali",
      occasionOther: "",
      milestone: null,
      eventDate: clock.eventDate,
      city: "Chennai",
      language: "en",
      vibe: "Warm, festive, everyone welcome",
      theme: "Festival of lights",
      tradition: ["tamil", "mixed_other"],
      traditionOther: "Residents from many states",
      dietary: ["veg"],
    },
    summary: {
      text: "A volunteer-run Diwali evening for 600 residents of a gated society, paid from society funds. Rangoli and diya painting for the kids, food stalls by residents, and a quiet light show instead of loud crackers.",
      origin: "ai",
    },
    budget: {
      total: 200_000,
      lines: [
        line("Decor and lighting", 45_000),
        line("Rangoli and craft supplies", 15_000),
        line("Food stalls", 50_000),
        line("Sound and stage", 35_000),
        line("Safety and first aid", 20_000),
        line("Prizes", 15_000),
        line("Contingency", 20_000),
      ],
    },
    functions: [],
    tasks: [
      t("Book society hall and terrace", "Venue", 28, { doneDaysAgo: 10 }),
      t("Approve the budget with the committee", "Budget", 25, { doneDaysAgo: 8 }),
      t("Form volunteer roster", "People", 30),
      t("Book sound and lighting", "Sound and stage", 14, { doneDaysAgo: 3 }),
      t("Collect resident registrations for rangoli", "Activities", 14),
      t("Announce the programme on the notice board", "Publicity", 14),
      t("Collect food stall sign-ups from residents", "Food stalls", 10),
      t("Buy rangoli colours and craft supplies", "Supplies", 7),
      t("Order eco-friendly lights", "Decor and lighting", 7),
      t("Arrange first-aid kit and volunteers", "Safety", 5),
      t("Fire-safety briefing with security staff", "Safety", 2),
      t("Set up the stage and seating", "Sound and stage", 1),
      t("Judge the rangoli competition", "Activities", 0),
      t("Run the diya-painting stall", "Activities", 0),
      t("Clean up the common areas", "Cleanup", -1),
      t("Return tents and chairs", "Logistics", -1),
      t("Thank the volunteers", "People", -2),
      t("Publish the account of spends to the committee", "Budget", -3),
    ],
    vendors: [
      vendor(clock, "Sound and lighting", "booked", {
        lineId: "line-sound-and-stage",
        bookByDaysBefore: 14,
        quoted: 30_000,
        paid: 10_000,
      }),
      vendor(clock, "Caterer for food stalls", "quoted", {
        lineId: "line-food-stalls",
        bookByDaysBefore: 10,
        quoted: 45_000,
      }),
      vendor(clock, "Tent and seating", "contacted", { lineId: "line-sound-and-stage", bookByDaysBefore: 10 }),
      vendor(clock, "First-aid volunteer kit", "paid", {
        lineId: "line-safety-and-first-aid",
        bookByDaysBefore: 7,
        quoted: 4_000,
        paid: 4_000,
      }),
      vendor(clock, "Eco-friendly lights supplier", "to_research", {
        lineId: "line-decor-and-lighting",
        bookByDaysBefore: 7,
      }),
      vendor(clock, "Photographer", "not_needed", { bookByDaysBefore: 7 }),
    ],
    ideas: [
      idea(
        "Rangoli competition by age group",
        "Separate rangoli categories for under-8s, 8-14s and adults, judged by senior residents.",
        "activity",
        6_000,
        ["details.occasion:diwali", "profile.role:community", "guests.kids"],
        { effort: "diy" },
      ),
      idea(
        "Diya-painting stall for kids",
        "Plain clay diyas and paints at a supervised stall; kids take their diya home.",
        "activity",
        30,
        ["details.occasion:diwali", "guests.kids"],
        { costBasis: "per kid", effort: "diy" },
      ),
      idea(
        "Light show instead of crackers",
        "A short laser or light show on the terrace: no smoke or noise for elderly residents and pets.",
        "entertainment",
        25_000,
        ["details.occasion:diwali", "guests.elderly"],
        { effort: "vendor" },
      ),
      idea(
        "Potluck food stalls by tradition",
        "Residents run stalls with sweets and snacks from their home states.",
        "food",
        null,
        ["details.traditionOther", "profile.role:community"],
        { effort: "diy" },
      ),
    ],
    guests: {
      total: 600,
      adults: 450,
      kids: 150,
      elderly: 90,
      veg: 600,
      jain: null,
      nonveg: null,
      outstation: null,
      cateringBufferPercent: 5,
    },
  });
}
