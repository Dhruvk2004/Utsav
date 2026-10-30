import { describe, expect, it } from "vitest";
import { finalizePlan } from "@/lib/domain/ops/apply";
import { applyOk, rejectReason, TODAY, USER, wedding } from "../../domainFixtures";

// The demo wedding is on 2026-12-27; today is 2026-10-28.
const find = (plan: ReturnType<typeof wedding>, id: string) => plan.tasks.find((t) => t.id === id);

describe("add_task", () => {
  it("adds a relative task linked to a function", () => {
    const plan = applyOk(wedding(), {
      type: "add_task",
      title: "Book the reception band",
      category: "Entertainment",
      daysBefore: -1,
      functionId: "fn-reception",
    });
    expect(find(plan, "task-book-the-reception-band")).toMatchObject({
      daysBefore: -1,
      pinnedDate: null,
      functionId: "fn-reception",
      done: false,
      origin: "user",
    });
  });

  it("pins a task to a date and stores its offset", () => {
    const plan = applyOk(wedding(), { type: "add_task", title: "Thank the pandit", category: "Rituals", date: "2027-01-03" });
    expect(find(plan, "task-thank-the-pandit")).toMatchObject({ pinnedDate: "2027-01-03", daysBefore: -7 });
  });

  it("gives a duplicate title its own id", () => {
    const plan = applyOk(wedding(), { type: "add_task", title: "Send invitations", category: "Guests", daysBefore: 35 });
    expect(find(plan, "task-send-invitations-2")).toBeDefined();
  });

  it.each([
    [{ date: "2026-10-27" }, /from today onwards/],
    [{ date: "2027-01-04" }, /due by 3 Jan 2027/],
    [{ daysBefore: 10, functionId: "fn-x" }, /Function not found/],
    [{}, /due date or the number of days/],
  ])("rejects %o", (fields, reason) => {
    expect(rejectReason(wedding(), { type: "add_task", title: "X", category: "Y", ...fields })).toMatch(reason);
  });

  it("rejects a pin more than two years before the event", () => {
    const plan = wedding();
    plan.details.eventDate = "2028-12-01";
    plan.functions = [];
    plan.tasks = [];
    plan.vendors = [];
    expect(rejectReason(finalizePlan(plan, TODAY), { type: "add_task", title: "X", category: "Y", date: "2026-11-01" })).toMatch(
      /within two years/,
    );
  });

  it("caps a plan at 150 tasks", () => {
    let plan = wedding();
    const ops = Array.from({ length: 150 - plan.tasks.length }, (_, i) => ({
      type: "add_task" as const,
      title: `Task ${i}`,
      category: "Misc",
      daysBefore: 1,
    }));
    for (const op of ops) plan = applyOk(plan, op);
    expect(rejectReason(plan, { type: "add_task", title: "One more", category: "Misc", daysBefore: 1 })).toMatch(/at most 150/);
  });
});

describe("update_task", () => {
  it("edits text and marks the task as the user's", () => {
    const plan = applyOk(wedding(), { type: "update_task", taskId: "task-book-decorator", title: "Book the decorator" });
    expect(find(plan, "task-book-decorator")).toMatchObject({ title: "Book the decorator", category: "Decor", origin: "user" });
  });

  it("moves a task by offset, pins it to a date, and unpins it", () => {
    let plan = applyOk(wedding(), { type: "update_task", taskId: "task-book-decorator", date: "2026-11-15" });
    expect(find(plan, "task-book-decorator")).toMatchObject({ pinnedDate: "2026-11-15", daysBefore: 42 });
    plan = applyOk(plan, { type: "update_task", taskId: "task-book-decorator", date: null });
    expect(find(plan, "task-book-decorator")).toMatchObject({ pinnedDate: null, daysBefore: 42 });
    plan = applyOk(plan, { type: "update_task", taskId: "task-book-decorator", daysBefore: 20 });
    expect(find(plan, "task-book-decorator")).toMatchObject({ pinnedDate: null, daysBefore: 20 });
  });

  it("ticks a task with a timestamp and unticks it", () => {
    let plan = applyOk(wedding(), { type: "update_task", taskId: "task-book-decorator", done: true });
    expect(find(plan, "task-book-decorator")).toMatchObject({ done: true, doneAt: USER.now, origin: "ai" });
    expect(plan.stats.tasksDone).toBe(13);
    plan = applyOk(plan, { type: "update_task", taskId: "task-book-decorator", done: true });
    plan = applyOk(plan, { type: "update_task", taskId: "task-book-decorator", done: false });
    expect(find(plan, "task-book-decorator")).toMatchObject({ done: false, doneAt: null });
  });

  it("uses midnight of today when the context has no clock", () => {
    const plan = applyOk(
      wedding(),
      { type: "update_task", taskId: "task-book-decorator", done: true },
      { today: "2026-10-28", actor: "user" },
    );
    expect(find(plan, "task-book-decorator")?.doneAt).toBe("2026-10-28T00:00:00.000Z");
  });

  it("rejects unknown tasks", () => {
    expect(rejectReason(wedding(), { type: "update_task", taskId: "task-x", done: true })).toMatch(/Task not found/);
  });
});

describe("remove_task", () => {
  it("removes a task and updates the stats", () => {
    const plan = applyOk(wedding(), { type: "remove_task", taskId: "task-book-decorator" });
    expect(plan.stats.tasksTotal).toBe(33);
    expect(rejectReason(plan, { type: "remove_task", taskId: "task-book-decorator" })).toMatch(/not found/);
  });
});
