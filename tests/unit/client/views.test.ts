import { describe, expect, it } from "vitest";
import { amountEditOp, amountForPercent, budgetRows, totalsOf } from "@/lib/client/budgetTable";
import { cateringText, guestsFormValues, guestsIssues, guestsOp } from "@/lib/client/guestsForm";
import { addToPlanDraft, ideaCost, ideaFlags, ideasUseSummary, whyThisIdea } from "@/lib/client/ideasView";
import { reviewPending, reviewRows } from "@/lib/client/review";
import { isShareToken, toSharedView } from "@/lib/client/shareView";
import { timelineGroups } from "@/lib/client/timelineView";
import { amountsNeeded, functionNames, overpaidText, pipelineStep, statusOp, vendorGroups } from "@/lib/client/vendorsView";
import { demoFixture } from "@/lib/demo/fixtures";
import type { EventDoc } from "@/lib/domain/model/event";
import { deriveView } from "@/lib/domain/view";
import { birthday, TODAY, wedding } from "../../domainFixtures";

const community = () => demoFixture("community", TODAY).event;
const view = (plan: EventDoc) => deriveView(plan, TODAY);

describe("budget table", () => {
  it("shows per-line money, variance and the contingency row", () => {
    const plan = wedding();
    const rows = budgetRows(plan, view(plan));
    expect(rows.find((r) => r.id === "line-photography")).toMatchObject({
      committed: 240_000,
      variance: -40_000,
      vendors: ["Videographer", "Photographer"],
    });
    expect(rows.find((r) => r.isContingency)?.category).toBe("Contingency");
    expect(totalsOf(rows)).toMatchObject({ amount: 2_500_000, committed: 1_118_000, paid: 240_000 });
    expect(amountEditOp("line-decor", 1, "keep_total").rebalance).toBe("spread_to_others");
    expect(amountEditOp("line-decor", 1, "change_total").rebalance).toBe("change_total");
    expect(amountForPercent(12.5, 2_500_000)).toBe(312_500);
  });
});

describe("timeline groups", () => {
  it("puts function days in phases, with the event day and the day after as Event days", () => {
    const plan = wedding();
    const groups = timelineGroups(plan, view(plan), "all", null);
    expect(groups.map((g) => g.label)).toEqual(["1–3 months before", "1–4 weeks before", "Final week", "Event days", "After the event"]);
    const day = groups.find((g) => g.id === "day")!;
    expect(day.entries.filter((e) => e.kind === "function").map((e) => (e.kind === "function" ? e.fn.name : ""))).toEqual([
      "Wedding",
      "Reception",
    ]);
    expect(groups.find((g) => g.id === "after")!.entries.every((e) => e.kind === "task")).toBe(true);
  });

  it("filters by state and function", () => {
    const plan = wedding();
    const tasks = (filter: "todo" | "done" | "overdue", fn: string | null = null) =>
      timelineGroups(plan, view(plan), filter, fn).flatMap((g) => g.entries.filter((e) => e.kind === "task"));
    expect(tasks("done")).toHaveLength(12);
    expect(tasks("todo")).toHaveLength(22);
    expect(tasks("overdue").length).toBeGreaterThan(0);
    const sangeet = timelineGroups(plan, view(plan), "all", "fn-sangeet").flatMap((g) => g.entries);
    expect(sangeet.filter((e) => e.kind === "function")).toHaveLength(1);
    expect(sangeet.filter((e) => e.kind === "task")).toHaveLength(2);
    const birthdayGroups = timelineGroups(birthday(), view(birthday()), "all", null);
    expect(birthdayGroups.find((g) => g.id === "day")?.label).toBe("Event day");
  });
});

describe("vendors", () => {
  it("groups by status and filters by function", () => {
    const plan = wedding();
    const groups = vendorGroups(view(plan), null);
    expect(groups.map((g) => g.vendors.length)).toEqual([3, 2, 1, 3, 1, 1]);
    expect(
      vendorGroups(view(plan), "fn-mehndi")
        .flatMap((g) => g.vendors)
        .map((v) => v.category),
    ).toEqual(["Mehndi artist"]);
    expect(functionNames(plan, plan.vendors[1])).toEqual(["Haldi", "Sangeet", "Wedding", "Reception"]);
  });

  it("asks for amounts before Booked and Paid, and warns on overpayment", () => {
    expect(amountsNeeded({ quotedAmount: null, paidAmount: 0 }, "booked")).toEqual({ quote: true, paid: false });
    expect(amountsNeeded({ quotedAmount: 100, paidAmount: 0 }, "paid")).toEqual({ quote: false, paid: true });
    expect(amountsNeeded({ quotedAmount: null, paidAmount: 0 }, "contacted")).toEqual({ quote: false, paid: false });
    expect(statusOp("v", "paid", { quoted: 10, paid: 5 })).toEqual({
      type: "set_vendor_status",
      vendorId: "v",
      status: "paid",
      quotedAmount: 10,
      paidAmount: 5,
    });
    expect(statusOp("v", "contacted")).toEqual({ type: "set_vendor_status", vendorId: "v", status: "contacted" });
    expect(overpaidText({ quotedAmount: 38_000, paidAmount: 40_000 })).toBe("Paid ₹2,000 more than quoted");
    expect(overpaidText({ quotedAmount: null, paidAmount: 40_000 })).toBeNull();
    expect(pipelineStep("quoted")).toBe(3);
    expect(pipelineStep("not_needed")).toBeNull();
  });
});

describe("ideas text", () => {
  it("summarises what drives ideas", () => {
    expect(ideasUseSummary(birthday())).toBe(
      "turning 6 · birthday girl · loves cartoons, Peppa Pig, painting · Peppa Pig theme · 25 kids · Jain-friendly food",
    );
    expect(ideasUseSummary(community())).toBe(
      "Diwali · community event · Festival of lights theme · 150 kids, 90 elderly · Tamil and residents from many states · vegetarian",
    );
    const plan = wedding();
    const anniversary = {
      ...plan,
      details: { ...plan.details, eventType: "anniversary" as const, milestone: 25, dietary: [] },
      honorees: [],
      guests: { ...plan.guests, kids: null, elderly: null },
    };
    expect(ideasUseSummary(anniversary)).toBe("25th anniversary · Marathi and Punjabi");
    const boy = { ...birthday(), honorees: [{ ...birthday().honorees[0], gender: "male" as const, interests: [] }] };
    expect(ideasUseSummary(boy)).toContain("birthday boy");
    expect(ideasUseSummary({ ...boy, honorees: [{ ...boy.honorees[0], gender: null }] })).toContain("birthday child");
  });

  it("explains why an idea fits from its basis", () => {
    const plan = community();
    expect(whyThisIdea(plan.ideas[0], plan)).toBe("Why this idea: Diwali, community event, 150 kids");
    expect(whyThisIdea({ basis: [] }, plan)).toBeNull();
    const all = [
      "details.milestone",
      "honoree.age",
      "honoree.interests",
      "guests.elderly",
      "guests.total",
      "profile.role:parent",
      "details.tradition",
      "details.traditionOther",
      "details.dietary:jain",
      "details.dietary",
      "details.theme",
      "date.season",
      "functions",
      "city",
      "nonsense",
    ];
    expect(whyThisIdea({ basis: all }, birthday())).toBe(
      "Why this idea: turning 6, their interests, elderly guests, 40 guests, your role, , your traditions, Jain-friendly, dietary needs, Peppa Pig theme, winter, the event, city, nonsense",
    );
    const bare = {
      ...wedding(),
      honorees: [],
      details: { ...wedding().details, milestone: null, theme: "" },
      guests: { ...wedding().guests, kids: null, elderly: null },
    };
    expect(
      whyThisIdea(
        { basis: ["details.milestone", "honoree.age", "guests.kids", "guests.elderly", "details.theme", "details.occasion", "functions"] },
        bare,
      ),
    ).toBe("Why this idea: the milestone, their age, kids, elderly guests, theme, the occasion, 5 functions");
  });

  it("marks costs as estimates and flags big or diet-unfriendly ideas", () => {
    const plan = birthday();
    expect(ideaCost({ estimatedCost: 150, costBasis: "per kid" })).toBe("≈ ₹150 per kid (estimate)");
    expect(ideaCost({ estimatedCost: null, costBasis: "per event" })).toBeNull();
    const potato = {
      title: "Potato wedges",
      description: "",
      category: "food" as const,
      estimatedCost: 2_000,
      costBasis: "per guest" as const,
    };
    expect(ideaFlags(potato, plan)).toEqual(["Above your budget", "May not suit Jain guests"]);
    expect(ideaFlags({ ...potato, category: "decor", costBasis: "per kid" }, plan)).toEqual(["Above your budget"]);
    expect(ideaFlags({ ...potato, category: "decor", costBasis: "per kid" }, { ...plan, guests: { ...plan.guests, kids: null } })).toEqual([
      "Above your budget",
    ]);
    expect(ideaFlags({ ...potato, category: "decor", estimatedCost: null }, plan)).toEqual([]);
  });

  it("turns a saved idea into a task and a budget note", () => {
    const plan = wedding();
    const draft = addToPlanDraft(plan, plan.ideas[1]);
    expect(draft).toMatchObject({ touchpoint: "add_to_plan", origin: "code" });
    expect(draft.items.map((i) => i.op)).toEqual([
      { type: "add_task", title: "Arrange: Bilingual welcome boards", category: "Decor", daysBefore: 21 },
      { type: "set_budget_note", lineId: "line-decor", note: "Idea: Bilingual welcome boards (≈ ₹8,000)" },
    ]);
    const ritual = addToPlanDraft(plan, plan.ideas[0]);
    expect(ritual.items[1].op).toMatchObject({ lineId: "line-contingency" });
    const noLines = { ...plan, budget: { ...plan.budget, lines: [] } };
    expect(addToPlanDraft(noLines, { ...plan.ideas[0], estimatedCost: null }).items).toEqual([
      { op: { type: "add_task", title: "Arrange: Fusion haldi", category: "General", daysBefore: 21 }, rationale: "From your saved idea." },
    ]);
    const catering = addToPlanDraft(plan, plan.ideas[2]);
    expect(catering.items[1].op).toMatchObject({
      lineId: "line-catering",
      note: "Two cuisines: Marathi and Punjabi counters; Idea: Two-cuisine food counters (≈ ₹350)",
    });
  });
});

describe("guests form", () => {
  const values = guestsFormValues(birthday().guests);

  it("round-trips counts and estimates plates", () => {
    expect(values).toMatchObject({ total: "40", adults: "15", kids: "25", elderly: "", buffer: "10" });
    expect(guestsIssues(values)).toEqual({});
    expect(guestsOp(values).guests).toMatchObject({ total: 40, kids: 25, elderly: null, cateringBufferPercent: 10 });
    expect(cateringText(values)).toBe("Plates: 45 (40 + 10% buffer)");
    expect(cateringText({ ...values, buffer: "40" })).toBeNull();
  });

  it("checks totals, ranges and adults plus kids", () => {
    expect(guestsIssues({ ...values, total: "" })).toMatchObject({ total: "Enter a whole number from 1 to 5000." });
    expect(guestsIssues({ ...values, jain: "50" })).toEqual({ jain: "Can't be more than the 40 guests in total." });
    expect(guestsIssues({ ...values, veg: "1.5" })).toEqual({ veg: "Enter a whole number, or leave it empty." });
    expect(guestsIssues({ ...values, adults: "10" })).toEqual({ kids: "Adults and kids should add up to 40 (now 35)." });
    expect(guestsIssues({ ...values, buffer: "" })).toEqual({ buffer: "Enter a buffer from 0 to 25%." });
  });
});

describe("review banner rows", () => {
  it("summarises each section while under review", () => {
    const plan = { ...birthday(), review: { budget: "reviewed", timeline: "pending", vendors: "pending", ideas: "reset" } as const };
    expect(reviewRows(plan, view(plan)).map((r) => [r.label, r.summary, r.state])).toEqual([
      ["Budget", "6 categories, ₹60,000", "reviewed"],
      ["Timeline", "12 tasks, 0 rushed", "pending"],
      ["Vendors", "1 category to book", "pending"],
      ["Ideas", "No ideas waiting", "reset"],
    ]);
    expect(reviewPending(plan)).toBe(true);
    const suggested = { ...plan, ideas: plan.ideas.map((i) => ({ ...i, state: "suggested" as const })) };
    expect(reviewRows(suggested, view(suggested))[3].summary).toBe("4 ideas, not saved yet");
    expect(reviewRows(birthday(), view(birthday()))).toEqual([]);
    expect(reviewPending(birthday())).toBe(false);
  });
});

describe("shared view (spec 10.15)", () => {
  it("shows a code-built heading and never names, labels, contacts or drafts", () => {
    const plan = wedding();
    plan.vendors[0] = { ...plan.vendors[0], label: "Secret lawns", contact: "98765 43210", notes: "Gate 2" };
    const shared = toSharedView(plan, view(plan), { showAmounts: true, showNotes: false, showTitle: false });
    expect(shared.heading).toBe("Wedding · Pune");
    expect(shared.money).toEqual({ overpaid: "₹2,000", committed: "₹11,18,000", paid: "₹2,40,000", remaining: "₹13,82,000" });
    expect(shared.notNeeded).toBe(1);
    expect(shared.vendors[0].amounts).toMatch(/^Quoted/);
    expect(JSON.stringify(shared)).not.toMatch(/Secret lawns|98765|Gate 2|Bride/);
    const hidden = toSharedView(plan, view(plan), { showAmounts: false, showNotes: true, showTitle: true });
    expect(hidden).toMatchObject({ heading: "Marathi-Punjabi wedding", budgetTotal: null, money: null });
    expect(hidden.lines[0].amount).toBeNull();
    expect(hidden.vendors.find((v) => v.note)?.note).toBe("Gate 2");
    expect(toSharedView(community(), view(community()), { showAmounts: true, showNotes: false, showTitle: false }).meta).toContain(
      "600 residents",
    );
  });

  it("flags lines whose committed money passes the allocation, or that were paid above the quote (CO-07 regression)", () => {
    const plan = wedding();
    const caterer = plan.vendors.find((v) => v.id === "vendor-caterer")!;
    const line = plan.budget.lines.find((l) => l.id === caterer.budgetLineId)!;
    Object.assign(caterer, { status: "paid", quotedAmount: line.amount + 5_000, paidAmount: line.amount + 20_000 });
    const shared = toSharedView(plan, view(plan), { showAmounts: true, showNotes: false, showTitle: false });
    const row = shared.lines.find((l) => l.category === line.category)!;
    expect(row.over).toMatch(/^Over by ₹[\d,]+ · ₹15,000 paid above the quote$/);
    expect(shared.money?.overpaid).toBe("₹17,000");
    expect(
      toSharedView(plan, view(plan), { showAmounts: false, showNotes: false, showTitle: false }).lines.every((l) => l.over === null),
    ).toBe(true);
  });

  it("accepts only 43-character base64url tokens", () => {
    expect(isShareToken("a".repeat(43))).toBe(true);
    expect(isShareToken("demo")).toBe(false);
    expect(isShareToken(`${"a".repeat(42)}!`)).toBe(false);
  });
});
