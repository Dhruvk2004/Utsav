import type { EventDoc } from "@/lib/domain/model/event";
import type { PlanProfile } from "@/lib/domain/model/user";
import { demoEvent, idea, line, task, vendor, type DemoClock } from "../build";

/** A 6th birthday in Bengaluru for a girl who loves cartoons, Peppa Pig and painting (spec 5.10, 7.2). */
export const birthdayProfile: PlanProfile = { role: "parent", budgetStyle: "balanced", language: "en" };

export function buildBirthday(clock: DemoClock): EventDoc {
  const t = (title: string, category: string, daysBefore: number, options?: Parameters<typeof task>[4]) =>
    task(clock, title, category, daysBefore, options);

  return demoEvent(clock, {
    details: {
      eventType: "birthday",
      title: "6th birthday",
      occasion: null,
      occasionOther: "",
      milestone: 6,
      eventDate: clock.eventDate,
      city: "Bengaluru",
      language: "en",
      vibe: "Bright, playful, lots of colour",
      theme: "Peppa Pig",
      tradition: [],
      traditionOther: "",
      dietary: ["jain"],
    },
    summary: {
      text: "A Peppa Pig party for a six-year-old who loves painting, with 25 kids and 15 adults. A Jain-friendly menu, a painting station as the main activity and small art kits to take home.",
      origin: "ai",
    },
    budget: {
      total: 60_000,
      lines: [
        line("Venue", 12_000),
        line("Food & cake", 22_000, "Jain menu: no root vegetables"),
        line("Decor", 9_000),
        line("Entertainment", 7_000),
        line("Return gifts", 5_000),
        line("Contingency", 5_000),
      ],
    },
    functions: [],
    tasks: [
      t("Book the party venue", "Venue", 40, { doneDaysAgo: 6 }),
      t("Pick the party theme", "Decor", 35, { doneDaysAgo: 2 }),
      t("Send invitations to parents", "Guests", 21),
      t("Book the entertainer", "Entertainment", 21),
      t("Buy painting supplies and aprons", "Activities", 10),
      t("Order return gifts", "Return gifts", 10),
      t("Order the cake", "Food & cake", 7),
      t("Confirm the Jain menu with the caterer", "Food & cake", 7),
      t("Confirm how many kids are coming", "Guests", 5),
      t("Set up decor and the painting station", "Decor", 0),
      t("Settle vendor balances", "Budget", -1),
      t("Send thank-you messages", "Guests", -2),
    ],
    vendors: [
      vendor(clock, "Venue", "booked", { lineId: "line-venue", bookByDaysBefore: 40, quoted: 12_000, paid: 5_000 }),
      vendor(clock, "Baker", "quoted", {
        lineId: "line-food-cake",
        bookByDaysBefore: 10,
        quoted: 3_500,
        questions: ["Can the cake be eggless?", "Can you make a Peppa Pig design?"],
      }),
      vendor(clock, "Decorator", "contacted", { lineId: "line-decor", bookByDaysBefore: 14 }),
      vendor(clock, "Entertainer", "to_research", { lineId: "line-entertainment", bookByDaysBefore: 21 }),
    ],
    ideas: [
      idea("Peppa Pig decor and cake", "Muddy-puddle blue and pink balloons, a Peppa Pig backdrop and a matching cake.", "decor", 8_000, [
        "honoree.interests:Peppa Pig",
        "details.theme",
      ]),
      idea(
        "Painting station with aprons",
        "Easels, washable paints and kid-size aprons so every child paints a picture to take home.",
        "activity",
        4_000,
        ["honoree.interests:painting", "honoree.age", "guests.kids"],
        { effort: "diy" },
      ),
      idea(
        "Mini art kits as return gifts",
        "Crayons, a small sketchbook and stickers in a cloth pouch.",
        "favours",
        150,
        ["honoree.interests:painting"],
        { costBasis: "per kid", effort: "diy" },
      ),
      idea(
        "Jain-friendly kids' menu",
        "Paneer tikka sliders, fruit skewers and cheesy pasta made without root vegetables.",
        "food",
        250,
        ["details.dietary:jain", "guests.kids"],
        { costBasis: "per guest", effort: "vendor" },
      ),
    ],
    guests: {
      total: 40,
      adults: 15,
      kids: 25,
      elderly: null,
      veg: null,
      jain: 40,
      nonveg: null,
      outstation: null,
      cateringBufferPercent: 10,
    },
    honorees: [
      {
        id: "honoree-birthday-girl",
        role: "birthday_child",
        name: "Birthday girl",
        age: 6,
        gender: "female",
        interests: ["cartoons", "Peppa Pig", "painting"],
        notes: "",
      },
    ],
  });
}
