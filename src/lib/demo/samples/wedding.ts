import type { EventDoc } from "@/lib/domain/model/event";
import type { PlanProfile } from "@/lib/domain/model/user";
import { demoEvent, fn, idea, line, task, vendor, type DemoClock } from "../build";

/**
 * Marathi-Punjabi wedding in Pune (spec 5.10), in the design system's canonical state S1:
 * committed ₹11,18,000, paid ₹2,40,000, Photography over by ₹40,000, 12 of 34 tasks done.
 */
export const weddingProfile: PlanProfile = { role: "self_family", budgetStyle: "balanced", language: "en" };

export function buildWedding(clock: DemoClock): EventDoc {
  const t = (title: string, category: string, daysBefore: number, options?: Parameters<typeof task>[4]) =>
    task(clock, title, category, daysBefore, options);
  const done = (daysAgo: number) => ({ doneDaysAgo: daysAgo });

  return demoEvent(clock, {
    details: {
      eventType: "wedding",
      title: "Marathi-Punjabi wedding",
      occasion: null,
      occasionOther: "",
      milestone: null,
      eventDate: clock.eventDate,
      city: "Pune",
      language: "en",
      vibe: "Pastel, floral, lots of music",
      theme: "",
      tradition: ["marathi", "punjabi"],
      traditionOther: "",
      dietary: ["veg", "nonveg_ok"],
    },
    summary: {
      text: "A five-function Marathi-Punjabi wedding in Pune for 350 guests: a shared haldi and mehndi day, a sangeet, the wedding and a reception the day after. Most of the budget goes to the venue and food; decor stays pastel and floral.",
      origin: "ai",
    },
    budget: {
      total: 2_500_000,
      lines: [
        line("Venue", 500_000),
        line("Catering", 750_000, "Two cuisines: Marathi and Punjabi counters"),
        line("Decor", 300_000),
        line("Attire & jewellery", 300_000),
        line("Photography", 200_000),
        line("Entertainment", 150_000),
        line("Invitations & gifts", 100_000),
        line("Makeup & mehndi", 50_000),
        line("Contingency", 150_000),
      ],
    },
    functions: [
      fn(clock, "Haldi", -2, 10, ["10:00", "13:00"]),
      fn(clock, "Mehndi", -2, 10),
      fn(clock, "Sangeet", -1, 15, ["19:00", "23:00"]),
      fn(clock, "Wedding", 0, 45, ["10:30", "14:00"]),
      fn(clock, "Reception", 1, 20, ["19:30", "23:30"]),
    ],
    tasks: [
      t("Fix the wedding date with both families", "Planning", 180, done(40)),
      t("Set the overall budget", "Budget", 170, done(38)),
      t("Book wedding venue", "Venue", 150, done(2)),
      t("Draft the guest list", "Guests", 140, done(30)),
      t("Book the caterer", "Catering", 120, done(12)),
      t("Book the videographer", "Photography", 110, done(9)),
      t("Book guest hotel block", "Logistics", 90, done(20)),
      t("Order wedding invitations", "Invitations", 100, done(15)),
      t("Shortlist decor themes", "Decor", 95, done(10)),
      t("Choose wedding outfits", "Attire", 85, done(8)),
      t("Get mehndi artist quotes", "Makeup", 80, done(5)),
      t("Fix the menu tasting date", "Catering", 70, done(4)),
      t("Book makeup artist", "Makeup", 75),
      t("Book decorator", "Decor", 55),
      t("Confirm sound and lights for the sangeet", "Entertainment", 50, { functionId: "fn-sangeet" }),
      t("Book pandit for the wedding rituals", "Rituals", 45, { functionId: "fn-wedding" }),
      t("Shortlist photographers", "Photography", 42),
      t("Send invitations", "Guests", 40),
      t("Pick mehndi designs", "Decor", 37, { functionId: "fn-mehndi" }),
      t("Plan sangeet performances", "Entertainment", 30, { functionId: "fn-sangeet" }),
      t("Finalise outfits and fittings", "Attire", 28),
      t("Arrange guest transport", "Logistics", 21),
      t("Order mehndi cones for guests", "Decor", 14, { functionId: "fn-mehndi" }),
      t("Finalise guest count with the caterer", "Catering", 10),
      t("Plan the haldi playlist", "Entertainment", 7, { functionId: "fn-haldi" }),
      t("Confirm decor timings for haldi", "Decor", 3, { functionId: "fn-haldi" }),
      t("Share the day-of schedule with vendors", "Coordination", 2),
      t("Pack the wedding-day emergency kit", "Logistics", 1),
      t("Welcome the baraat", "Rituals", 0, { functionId: "fn-wedding" }),
      t("Brief the reception emcee", "Entertainment", -1, { functionId: "fn-reception" }),
      t("Settle vendor balances", "Budget", -1),
      t("Return rented items", "Logistics", -2),
      t("Send thank-you messages", "Guests", -5),
      t("Collect photos and videos", "Photography", -7),
    ],
    vendors: [
      vendor(clock, "Venue", "booked", { lineId: "line-venue", bookByDaysBefore: 150, quoted: 450_000, paid: 100_000 }),
      vendor(clock, "Caterer", "booked", {
        lineId: "line-catering",
        functionIds: ["fn-haldi", "fn-sangeet", "fn-wedding", "fn-reception"],
        bookByDaysBefore: 120,
        quoted: 390_000,
        paid: 100_000,
        questions: ["Is a tasting included?", "Can you run Marathi and Punjabi counters together?"],
      }),
      vendor(clock, "Videographer", "booked", { lineId: "line-photography", bookByDaysBefore: 110, quoted: 240_000 }),
      vendor(clock, "Invitation printer", "paid", {
        lineId: "line-invitations-gifts",
        bookByDaysBefore: 100,
        quoted: 38_000,
        paid: 40_000,
      }),
      vendor(clock, "Mehndi artist", "quoted", {
        lineId: "line-makeup-mehndi",
        functionIds: ["fn-mehndi"],
        bookByDaysBefore: 45,
        quoted: 45_000,
      }),
      vendor(clock, "Photographer", "contacted", {
        lineId: "line-photography",
        bookByDaysBefore: 42,
        questions: ["How many edited photos are included?", "When do we get the album?"],
      }),
      vendor(clock, "Sound & lights", "contacted", {
        lineId: "line-entertainment",
        functionIds: ["fn-sangeet"],
        bookByDaysBefore: 50,
      }),
      vendor(clock, "Decorator", "to_research", { lineId: "line-decor", bookByDaysBefore: 55 }),
      vendor(clock, "Pandit", "to_research", { functionIds: ["fn-wedding"], bookByDaysBefore: 45 }),
      vendor(clock, "Makeup artist", "to_research", { lineId: "line-makeup-mehndi", bookByDaysBefore: 75 }),
      vendor(clock, "Bridal car", "not_needed", { bookByDaysBefore: 14 }),
    ],
    ideas: [
      idea(
        "Fusion haldi",
        "Combine the Marathi halad and the Punjabi vatna into one morning, with both families applying it together.",
        "ritual",
        15_000,
        ["details.tradition:marathi", "details.tradition:punjabi", "functions"],
      ),
      idea("Bilingual welcome boards", "Welcome boards in Marathi and Punjabi at the venue entrance.", "decor", 8_000, [
        "details.tradition",
      ]),
      idea(
        "Two-cuisine food counters",
        "Puran poli and Amritsari kulcha counters side by side, so both families find their favourites.",
        "food",
        350,
        ["details.tradition", "guests.total"],
        { costBasis: "per guest", effort: "vendor" },
      ),
      idea(
        "Outdoor sangeet with heaters",
        "An open-air sangeet with patio heaters and warm drinks for a winter night.",
        "experience",
        40_000,
        ["date.season", "functions"],
      ),
      idea("Pastel floral mandap", "A mandap in blush and mint flowers to match the pastel vibe.", "decor", 90_000, ["details.vibe"], {
        effort: "vendor",
      }),
      idea("Dhol entry for the baraat", "Dhol players lead the baraat to the venue.", "entertainment", 20_000, [
        "details.tradition:punjabi",
      ]),
    ],
    guests: {
      total: 350,
      adults: 320,
      kids: 30,
      elderly: 40,
      veg: 200,
      jain: null,
      nonveg: 150,
      outstation: 80,
      cateringBufferPercent: 10,
    },
    honorees: [
      { id: "honoree-bride", role: "bride", name: "Bride", age: null, gender: null, interests: [], notes: "" },
      { id: "honoree-groom", role: "groom", name: "Groom", age: null, gender: null, interests: [], notes: "" },
    ],
  });
}
