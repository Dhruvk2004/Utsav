import { describe, expect, it } from "vitest";
import { LocalPlanStore } from "@/lib/plan/LocalPlanStore";
import { DECOR_CUT, planStoreContract, proposalOf } from "../../contracts/planStoreContract";
import { TODAY, wedding } from "../../domainFixtures";

const reviewed = () => ({
  ...wedding(),
  review: { budget: "pending", timeline: "pending", vendors: "pending", ideas: "pending" } as const,
});
const makeStore = () => new LocalPlanStore(wedding(), TODAY);

planStoreContract("LocalPlanStore", makeStore);

describe("LocalPlanStore (stub server store)", () => {
  it("is the server mode and bumps the version on every change, including undo", async () => {
    const store = makeStore();
    expect(store.mode).toBe("server");
    await store.applyManual([{ type: "set_summary", text: "Hello" }]);
    expect(store.getPlan()).toMatchObject({ version: 2, summary: { text: "Hello", origin: "user" } });
    await store.undo();
    expect(store.getPlan()).toMatchObject({ version: 3, summary: { origin: "ai" } });
  });

  it("applies manual ops all or nothing, of any type", async () => {
    const store = makeStore();
    const result = await store.applyManual([
      { type: "rename_function", functionId: "fn-haldi", name: "Halad" },
      { type: "remove_task", taskId: "nope" },
    ]);
    expect(result).toMatchObject({ ok: false, reason: "Task not found in this plan" });
    expect(store.getPlan().version).toBe(1);
  });

  it("marks sections reviewed without a version bump, and only when the plan is under review", async () => {
    const store = new LocalPlanStore(reviewed(), TODAY);
    await store.markReviewed("budget", "reviewed");
    expect(store.getPlan()).toMatchObject({ version: 1, review: { budget: "reviewed", timeline: "pending" } });
    const plain = makeStore();
    await plain.markReviewed("budget", "reviewed");
    expect(plain.getPlan().review).toBeNull();
  });

  it("starts from the starter template only while nothing has changed", async () => {
    const store = new LocalPlanStore(reviewed(), TODAY);
    expect(store.canStartFromTemplate()).toBe(true);
    const result = await store.startFromTemplate();
    expect(result.ok).toBe(true);
    expect(store.getPlan().review).toEqual({ budget: "reset", timeline: "reset", vendors: "reset", ideas: "reset" });
    expect(store.canStartFromTemplate()).toBe(false);
    await store.undo();
    expect(store.getPlan().review?.budget).toBe("pending");
  });

  it("keeps a declined card's plan without a new version", async () => {
    const store = makeStore();
    await store.decide(proposalOf([DECOR_CUT]), [{ itemId: "i1", action: "decline" }]);
    expect(store.getPlan().version).toBe(1);
  });
});
