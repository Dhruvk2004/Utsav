import { describe, expect, it } from "vitest";
import { IDEA_LIBRARY, libraryIdeas } from "@/lib/domain/ideaLibrary";
import { resolveName } from "@/lib/domain/resolve";
import { birthday, TODAY, wedding } from "../../domainFixtures";
import { demoFixture } from "@/lib/demo/fixtures";
import type { EventDoc } from "@/lib/domain/model/event";

const titles = (plan: EventDoc, focus: Parameters<typeof libraryIdeas>[1] = []) => libraryIdeas(plan, focus).map((i) => i.title);

describe("idea library (spec 6.5)", () => {
  it("has about 40 ideas with unique titles", () => {
    expect(IDEA_LIBRARY.length).toBeGreaterThanOrEqual(40);
    expect(new Set(IDEA_LIBRARY.map((i) => i.title)).size).toBe(IDEA_LIBRARY.length);
  });

  it("matches a wedding's functions, tradition and season, never other occasions' rituals", () => {
    const plan = { ...wedding(), ideas: [] };
    const all = libraryIdeas(plan, [], 50).map((i) => i.title);
    expect(all).toContain("Marigold haldi decor with floral jewellery");
    expect(all).toContain("Dhol entry");
    expect(all).not.toContain("Rangoli competition by age group");
    expect(all).not.toContain("Cartoon-character decor and cake");
  });

  it("uses the milestone as the age when no honoree age is given, and honours focus and dismissals", () => {
    const plan = { ...birthday(), ideas: [], honorees: [], dismissedIdeaTitles: ["puppet show"] };
    const all = libraryIdeas(plan, [], 50);
    expect(all.map((i) => i.title)).not.toContain("Puppet show");
    expect(all.find((i) => i.title === "Cartoon-character decor and cake")?.basis).toEqual(["details.eventType", "honoree.age"]);
    expect(all.map((i) => i.title)).not.toContain("Box-cricket tournament");
    expect(titles(plan, ["favours"])).toEqual(["Mini art kits as return gifts"]);
  });

  it("needs elderly guests, a tradition or a matching season for ideas tagged with them", () => {
    const community = { ...demoFixture("community", TODAY).event, ideas: [] };
    const all = libraryIdeas(community, [], 50);
    expect(all.find((i) => i.title === "Accessible seating and a short programme")?.basis).toEqual(["guests.elderly"]);
    expect(all.map((i) => i.title)).not.toContain("Covered venue with waterproof decor");
    const monsoon = { ...community, details: { ...community.details, eventDate: "2027-07-15", occasion: null } };
    expect(libraryIdeas(monsoon, [], 50).find((i) => i.title === "Covered venue with waterproof decor")?.basis).toEqual(["date.season"]);
  });
});

describe("resolveName (spec 6.3)", () => {
  const items = [
    { id: "a", name: "Make up" },
    { id: "b", name: "Makeup & mehndi" },
    { id: "c", name: "Decor" },
  ];
  const resolve = (q: string) => resolveName(items, (i) => i.name, q, "category");
  it("takes ids, exact names, then a unique prefix", () => {
    expect(resolve("c")).toEqual({ ok: true, id: "c" });
    expect(resolve(" make  UP ")).toEqual({ ok: true, id: "a" });
    expect(resolve("dec")).toEqual({ ok: true, id: "c" });
    expect(resolve("Mak")).toEqual({ ok: false, reason: '2 categorys match "Mak"; pick one' });
    expect(resolve("")).toEqual({ ok: false, reason: 'No category called ""' });
  });
});
