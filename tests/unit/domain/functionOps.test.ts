import { describe, expect, it } from "vitest";
import { sumAmounts } from "@/lib/domain/budget";
import type { EventDoc } from "@/lib/domain/model/event";
import { applyOk, birthday, rejectReason, wedding } from "../../domainFixtures";

// The demo wedding is on Sun 27 Dec 2026: Haldi and Mehndi on the 25th, Sangeet 26th, Wedding 27th, Reception 28th.
const shares = (plan: EventDoc) => Object.fromEntries(plan.functions.map((f) => [f.name, f.sharePercent]));
const byId = (plan: EventDoc, id: string) => plan.functions.find((f) => f.id === id);

describe("add_function", () => {
  it("adds a function at a day offset with a pinned share, scaling the others", () => {
    const plan = applyOk(wedding(), { type: "add_function", name: "Cocktail night", dayOffset: -3, sharePercent: 10 });
    expect(plan.functions[0]).toMatchObject({ name: "Cocktail night", date: "2026-12-24", sharePercent: 10, origin: "user" });
    expect(shares(plan)).toMatchObject({ Haldi: 9, Sangeet: 13.5, Wedding: 40.5, Reception: 18 });
    expect(sumAmounts(plan.functions)).toBe(2_500_000);
  });

  it("gives a new function an even share when none is given", () => {
    const plan = applyOk(wedding(), { type: "add_function", name: "Puja", date: "2026-12-20", startTime: "08:00", endTime: "10:00" });
    expect(byId(plan, "fn-puja")).toMatchObject({ sharePercent: 16.7, startTime: "08:00", endTime: "10:00" });
  });

  it("gives the first function the whole budget and defaults to the event day", () => {
    const plan = applyOk(birthday(), { type: "add_function", name: "Party", sharePercent: 40 });
    expect(plan.functions).toEqual([expect.objectContaining({ date: plan.details.eventDate, sharePercent: 100, amount: 60_000 })]);
  });

  it("allows a reception the day after the event", () => {
    const plan = applyOk(birthday(), { type: "add_function", name: "Family lunch", dayOffset: 1 });
    expect(plan.functions[0].date).toBe("2026-12-03");
  });

  it.each([
    [{ date: "2026-10-27" }, /from today onwards/],
    [{ date: "2026-12-29" }, /between 13 Dec 2026 and 28 Dec 2026/],
    [{ dayOffset: -2, startTime: "10:00" }, /both a start and an end time/],
    [{ dayOffset: -2, startTime: "10:00", endTime: "09:00" }, /end time must be after/],
    [{ name: "sangeet" }, /already a function called/],
  ])("rejects %o", (fields, reason) => {
    expect(rejectReason(wedding(), { type: "add_function", name: "Puja", ...fields })).toMatch(reason);
  });

  it("caps an event at eight functions", () => {
    let plan = wedding();
    for (const name of ["A", "B", "C"]) plan = applyOk(plan, { type: "add_function", name });
    expect(rejectReason(plan, { type: "add_function", name: "D" })).toMatch(/at most 8 functions/);
  });
});

describe("move_function", () => {
  it("moves the sangeet to Friday and shifts its linked tasks", () => {
    const plan = applyOk(wedding(), { type: "move_function", functionId: "fn-sangeet", weekday: "friday" });
    expect(byId(plan, "fn-sangeet")?.date).toBe("2026-12-25");
    expect(plan.tasks.find((t) => t.id === "task-plan-sangeet-performances")?.daysBefore).toBe(31);
    expect(plan.tasks.find((t) => t.id === "task-send-invitations")?.daysBefore).toBe(40);
  });

  it("keeps a pinned linked task where the user put it", () => {
    let plan = applyOk(wedding(), { type: "update_task", taskId: "task-plan-sangeet-performances", date: "2026-11-30" });
    plan = applyOk(plan, { type: "move_function", functionId: "fn-sangeet", date: "2026-12-20" });
    expect(plan.tasks.find((t) => t.id === "task-plan-sangeet-performances")).toMatchObject({ pinnedDate: "2026-11-30", daysBefore: 27 });
  });

  it("changes only the times, or clears them", () => {
    let plan = applyOk(wedding(), { type: "move_function", functionId: "fn-haldi", startTime: "09:00", endTime: "12:00" });
    expect(byId(plan, "fn-haldi")).toMatchObject({ date: "2026-12-25", startTime: "09:00", endTime: "12:00" });
    plan = applyOk(plan, { type: "move_function", functionId: "fn-haldi", startTime: null, endTime: null });
    expect(byId(plan, "fn-haldi")).toMatchObject({ startTime: null, endTime: null });
  });

  it("rejects a date outside the window and a lone end time", () => {
    expect(rejectReason(wedding(), { type: "move_function", functionId: "fn-haldi", date: "2026-12-01" })).toMatch(/between/);
    expect(rejectReason(wedding(), { type: "move_function", functionId: "fn-mehndi", endTime: "20:00" })).toMatch(/both a start/);
    expect(rejectReason(wedding(), { type: "move_function", functionId: "fn-x", date: "2026-12-26" })).toMatch(/not found/);
  });
});

describe("set_function_share", () => {
  it("pins one share and rebalances the rest to 100", () => {
    const plan = applyOk(wedding(), { type: "set_function_share", functionId: "fn-wedding", percent: 50 });
    expect(shares(plan)).toEqual({ Haldi: 9.1, Mehndi: 9.1, Sangeet: 13.6, Wedding: 50, Reception: 18.2 });
    expect(byId(plan, "fn-wedding")?.amount).toBe(1_250_000);
  });

  it("keeps a single function at 100%", () => {
    const plan = applyOk(birthday(), { type: "add_function", name: "Party" });
    expect(rejectReason(plan, { type: "set_function_share", functionId: "fn-party", percent: 60 })).toMatch(/always has 100%/);
    applyOk(plan, { type: "set_function_share", functionId: "fn-party", percent: 100 });
  });
});

describe("rename_function", () => {
  it("renames and rejects clashes", () => {
    const plan = applyOk(wedding(), { type: "rename_function", functionId: "fn-sangeet", name: "Cocktail night" });
    expect(byId(plan, "fn-sangeet")).toMatchObject({ name: "Cocktail night", origin: "user" });
    expect(rejectReason(wedding(), { type: "rename_function", functionId: "fn-sangeet", name: "HALDI" })).toMatch(/already/);
  });
});

describe("remove_function", () => {
  it("unlinks tasks and vendors and renormalises the other shares", () => {
    const plan = applyOk(wedding(), { type: "remove_function", functionId: "fn-sangeet" });
    expect(plan.tasks.filter((t) => t.functionId === "fn-sangeet")).toEqual([]);
    expect(plan.tasks.find((t) => t.id === "task-plan-sangeet-performances")?.functionId).toBeNull();
    expect(plan.vendors.find((v) => v.id === "vendor-caterer")?.functionIds).toEqual(["fn-haldi", "fn-wedding", "fn-reception"]);
    expect(shares(plan)).toEqual({ Haldi: 11.8, Mehndi: 11.8, Wedding: 52.9, Reception: 23.5 });
  });

  it("removes the last function", () => {
    let plan = applyOk(birthday(), { type: "add_function", name: "Party" });
    plan = applyOk(plan, { type: "remove_function", functionId: "fn-party" });
    expect(plan.functions).toEqual([]);
  });
});
