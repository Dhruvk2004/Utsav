import { describe, expect, it } from "vitest";
import type { EventDoc, IdeaFields } from "@/lib/domain/model/event";
import { AI, applyOk, CODE, rejectReason, wedding } from "../../domainFixtures";

const idea: IdeaFields = {
  title: "Mehndi cone favours",
  description: "Small mehndi cones for guests to take home.",
  category: "favours",
  estimatedCost: 40,
  costBasis: "per guest",
  basis: ["functions"],
  effort: "diy",
};
const find = (plan: EventDoc, id: string) => plan.ideas.find((i) => i.id === id);

describe("add_idea provenance", () => {
  it.each([
    ["a manual add", { today: "2026-10-28", actor: "user" as const }, "user", "user"],
    ["an AI proposal", AI, "ai", "ai"],
    ["the idea library", { ...AI, proposalOrigin: "library" as const }, "ai", "library"],
    ["a code proposal", CODE, "code", "user"],
    ["an edited AI proposal", { ...AI, edited: true }, "user", "ai"],
  ])("stores %s as saved with origin %s and source %s", (_, ctx, origin, source) => {
    const plan = applyOk(wedding(), { type: "add_idea", idea }, ctx);
    expect(find(plan, "idea-mehndi-cone-favours")).toMatchObject({ state: "saved", origin, source });
  });

  it("rejects a duplicate title, and a dismissed one from AI only", () => {
    expect(rejectReason(wedding(), { type: "add_idea", idea: { ...idea, title: "Fusion haldi!" } })).toMatch(/already have/);
    let plan = applyOk(wedding(), { type: "add_idea", idea });
    plan = applyOk(plan, { type: "remove_idea", ideaId: "idea-mehndi-cone-favours", dismiss: true });
    expect(plan.dismissedIdeaTitles).toEqual(["mehndi cone favours"]);
    expect(rejectReason(plan, { type: "add_idea", idea }, AI)).toMatch(/dismissed this idea/);
    applyOk(plan, { type: "add_idea", idea });
  });

  it("caps a plan at 60 ideas", () => {
    let plan = wedding();
    for (let i = plan.ideas.length; i < 60; i++) plan = applyOk(plan, { type: "add_idea", idea: { ...idea, title: `Idea ${i}` } });
    expect(rejectReason(plan, { type: "add_idea", idea })).toMatch(/at most 60/);
  });
});

describe("update, save and remove ideas", () => {
  it("edits an idea and hands it to the user", () => {
    const plan = applyOk(wedding(), { type: "update_idea", ideaId: "idea-fusion-haldi", patch: { estimatedCost: 12_000 } });
    expect(find(plan, "idea-fusion-haldi")).toMatchObject({ estimatedCost: 12_000, origin: "user", source: "ai" });
    expect(rejectReason(wedding(), { type: "update_idea", ideaId: "idea-fusion-haldi", patch: { title: "Pastel floral mandap" } })).toMatch(
      /already have/,
    );
    applyOk(wedding(), { type: "update_idea", ideaId: "idea-fusion-haldi", patch: { title: "Fusion Haldi" } });
  });

  it("saves a suggested idea once", () => {
    const plan = wedding();
    plan.ideas[0].state = "suggested";
    const saved = applyOk(plan, { type: "save_idea", ideaId: plan.ideas[0].id });
    expect(saved.ideas[0].state).toBe("saved");
    expect(rejectReason(saved, { type: "save_idea", ideaId: plan.ideas[0].id })).toMatch(/already saved/);
  });

  it("removes ideas, remembers dismissed titles (newest 50) and clears them", () => {
    let plan = wedding();
    plan.dismissedIdeaTitles = Array.from({ length: 50 }, (_, i) => `old ${i}`);
    plan = applyOk(plan, { type: "remove_idea", ideaId: "idea-fusion-haldi", dismiss: true });
    expect(plan.dismissedIdeaTitles).toHaveLength(50);
    expect(plan.dismissedIdeaTitles.at(-1)).toBe("fusion haldi");
    expect(plan.dismissedIdeaTitles[0]).toBe("old 1");
    plan = applyOk(plan, { type: "remove_idea", ideaId: "idea-pastel-floral-mandap" });
    expect(plan.dismissedIdeaTitles.at(-1)).toBe("fusion haldi");
    plan = applyOk(plan, { type: "clear_dismissed_ideas" });
    expect(plan.dismissedIdeaTitles).toEqual([]);
  });
});
