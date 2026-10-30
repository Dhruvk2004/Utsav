import { describe, expect, it } from "vitest";
import {
  activeVendorCount,
  chipsFor,
  DEMO_TABS,
  demoTabHref,
  headerMeta,
  parseTab,
  WORKSPACE_TABS,
  workspaceTabHref,
} from "@/lib/client/workspace";
import { toSharedView } from "@/lib/client/shareView";
import { demoFixture } from "@/lib/demo/fixtures";
import { formatCount } from "@/lib/domain/budget";
import { templateDraft } from "@/lib/domain/template";
import { deriveView } from "@/lib/domain/view";
import { TODAY, wedding } from "../../domainFixtures";
import { makeInput } from "../../fixtures";

describe("workspace tabs, links and header", () => {
  it("links tabs as routes in the workspace and as ?tab= in the demo", () => {
    expect(workspaceTabHref("stub wedding", "overview")).toBe("/events/stub%20wedding");
    expect(workspaceTabHref("e1", "budget")).toBe("/events/e1/budget");
    expect(demoTabHref("birthday", "ideas")).toBe("/demo/birthday?tab=ideas");
    expect(DEMO_TABS).not.toContain("guests");
    expect(parseTab("vendors", WORKSPACE_TABS, "overview")).toBe("vendors");
    expect(parseTab("guests", DEMO_TABS, "ideas")).toBe("ideas");
    expect(parseTab(null, WORKSPACE_TABS, "overview")).toBe("overview");
  });

  it("offers four chips per tab, led by the sample's recorded chip in the demo", () => {
    const plan = wedding();
    const community = demoFixture("community", TODAY).event;
    for (const tab of WORKSPACE_TABS) expect(chipsFor(tab, plan)).toHaveLength(4);
    expect(chipsFor("budget", plan, "wedding")).toEqual([
      "Cut decor spend by 20%",
      "Move ₹30,000 from Decor to Catering",
      "Keep the total under ₹23,75,000",
      "What's left to pay?",
    ]);
    expect(chipsFor("ideas", community, "community")[0]).toBe("Add volunteer tasks for the event day");
    expect(chipsFor("ideas", community, "community")).toHaveLength(4);
  });

  it("builds chips from the event's type, occasion, functions and guests (CO-05 regression)", () => {
    const community = demoFixture("community", TODAY).event;
    const all = WORKSPACE_TABS.flatMap((tab) => chipsFor(tab, community));
    expect(all.join(" ")).not.toMatch(/sangeet|mehndi|wedding/i);
    expect(chipsFor("timeline", community)).toContain("Add a task to buy 2,000 diyas");
    expect(chipsFor("ideas", community)).toContain("Ideas that fit Diwali");
    expect(chipsFor("overview", community).at(-1)).toMatch(/^We're now [\d,]+ residents$/);
    const plan = wedding();
    expect(chipsFor("timeline", plan)[0]).toBe(`Move the ${plan.functions[0].name.toLowerCase()} to Friday`);
    expect(chipsFor("timeline", plan)).toContain("Add a task to book the mehndi artist");
    const party = { ...demoFixture("birthday", TODAY).event, functions: [] };
    expect(chipsFor("overview", party)).toContain("Push the party back by a week");
    expect(chipsFor("vendors", party)[0]).toBe("Add a magician");
    const kinds = (eventType: "anniversary" | "other" | "community", occasion: "holi" | null = null) => ({
      ...plan,
      details: { ...plan.details, eventType, occasion },
    });
    expect(chipsFor("vendors", kinds("anniversary"))[0]).toBe("Add a live band");
    expect(chipsFor("vendors", kinds("other"))[0]).toBe("Add a photographer");
    expect(chipsFor("timeline", kinds("community", "holi"))).toContain("Add a task to recruit volunteers");
    expect(chipsFor("ideas", kinds("other"))).toContain("Ideas that fit the event");
    // A plan without a decor line, or with only Contingency, still offers four budget chips.
    const bare = { ...plan, vendors: [], budget: { ...plan.budget, lines: plan.budget.lines.filter((l) => l.category === "Contingency") } };
    expect(chipsFor("budget", bare)).toEqual([
      "Cut the biggest category by 10%",
      "What's the biggest category?",
      "Keep the total under ₹23,75,000",
      "What's left to pay?",
    ]);
    expect(chipsFor("vendors", bare)[1]).toBe("Add a note to the caterer: wants 50% advance");
  });

  it("builds the header meta with countdown and festival proximity", () => {
    const plan = wedding();
    expect(headerMeta(plan, deriveView(plan, TODAY), TODAY)).toEqual({
      title: "Marathi-Punjabi wedding",
      date: "Sun 27 Dec 2026",
      countdown: "60 days to go",
      festival: "2 days after Christmas",
      city: "Pune",
      guests: "350 guests",
      budget: "₹25,00,000",
    });
    const community = demoFixture("community", TODAY).event;
    const meta = headerMeta({ ...community, details: { ...community.details, title: "" } }, deriveView(community, TODAY), TODAY);
    expect(meta).toMatchObject({ title: "Diwali celebration", festival: "2 days before Diwali", guests: "600 residents" });
    const onDiwali = { ...community, details: { ...community.details, eventDate: "2026-11-08" } };
    expect(headerMeta(onDiwali, deriveView(onDiwali, TODAY), TODAY).festival).toBe("On Diwali");
    const away = { ...community, details: { ...community.details, eventDate: "2026-11-07" } };
    expect(headerMeta(away, deriveView(away, TODAY), TODAY).festival).toBe("1 day before Diwali");
    const quiet = { ...plan, details: { ...plan.details, eventDate: "2027-02-10" } };
    expect(headerMeta(quiet, deriveView(quiet, TODAY), TODAY).festival).toBeNull();
  });

  it("groups guest counts the Indian way in the header, share meta, event card and template summary (QA-06 regression)", () => {
    const big = { ...wedding(), guests: { ...wedding().guests, total: 5_000 } };
    expect(headerMeta(big, deriveView(big, TODAY), TODAY).guests).toBe("5,000 guests");
    expect(toSharedView(big, deriveView(big, TODAY), { showAmounts: false, showNotes: false, showTitle: false }).meta).toContain(
      "· 5,000 guests",
    );
    expect(templateDraft({ ...makeInput(), guestCount: 5_000, functions: [] }).summary).toContain("for 5,000 guests.");
    expect(formatCount(150_000)).toBe("1,50,000");
  });

  it("counts active vendors for the tab badge", () => {
    expect(activeVendorCount(wedding())).toBe(10);
  });
});
