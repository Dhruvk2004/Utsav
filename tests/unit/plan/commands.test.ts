import { describe, expect, it } from "vitest";
import type { Proposal } from "@/lib/domain/model/records";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import {
  applyManual,
  changedSections,
  decide,
  HISTORY_TTL_MS,
  historyLabel,
  markReviewed,
  pendingStats,
  UNDO_STALE_MESSAGE,
  undoEntry,
} from "@/lib/plan/commands";
import { DECOR_CUT, proposalOf } from "../../contracts/planStoreContract";
import { wedding } from "../../domainFixtures";

const clock = { today: "2026-10-28", now: "2026-10-28T06:00:00.000Z" };
const decor = (plan: ReturnType<typeof wedding>) => plan.budget.lines.find((line) => line.id === "line-decor")?.amount;

describe("applyManual (PATCH)", () => {
  it("applies the ops, bumps the version and writes a history entry with the touched sections", () => {
    const event = wedding();
    const result = applyManual(event, event.version, [DECOR_CUT], clock);
    if (!result.ok) throw new Error("expected ok");
    expect(decor(result.event)).toBe(240_000);
    expect(result.event).toMatchObject({ version: event.version + 1, updatedAt: clock.now });
    expect(result.history).toMatchObject({
      actor: "user",
      ops: [DECOR_CUT],
      versionBefore: event.version,
      versionAfter: event.version + 1,
    });
    // The total changed, so function amounts (derived from shares) changed too.
    expect(Object.keys(result.history.before)).toEqual(["budget", "functions"]);
    expect(Date.parse(result.history.expireAt) - Date.parse(result.history.createdAt)).toBe(HISTORY_TTL_MS);
  });

  it("is a conflict on a stale base version", () => {
    const event = wedding();
    expect(applyManual(event, event.version - 1, [DECOR_CUT], clock)).toEqual({ ok: false, kind: "conflict", event });
  });

  it("applies nothing when any op is rejected, and reports why", () => {
    const event = wedding();
    const result = applyManual(event, event.version, [DECOR_CUT, { type: "remove_task", taskId: "nope" }], clock);
    expect(result).toMatchObject({ ok: false, kind: "rejected", reason: expect.stringMatching(/Task/) });
  });
});

describe("undoEntry", () => {
  it("restores the snapshot as a new version while nothing changed since", () => {
    const event = wedding();
    const applied = applyManual(event, event.version, [DECOR_CUT], clock);
    if (!applied.ok) throw new Error("expected ok");
    const undone = undoEntry(applied.event, applied.history, clock);
    if (!undone.ok) throw new Error("expected ok");
    expect(decor(undone.event)).toBe(300_000);
    expect(undone.event.version).toBe(event.version + 2);
    expect(undone.history.label).toMatch(/^Undo: /);
  });

  it("refuses once the plan has changed after the entry", () => {
    const event = wedding();
    const applied = applyManual(event, event.version, [DECOR_CUT], clock);
    if (!applied.ok) throw new Error("expected ok");
    expect(undoEntry({ ...applied.event, version: applied.event.version + 1 }, applied.history, clock)).toEqual({
      ok: false,
      reason: UNDO_STALE_MESSAGE,
    });
  });
});

describe("decide", () => {
  it("applies an accepted item as user_via_ai with one history entry", () => {
    const event = wedding();
    const result = decide(event, proposalOf([DECOR_CUT]), [{ itemId: "i1", action: "accept" }], clock);
    expect(decor(result.event)).toBe(240_000);
    expect(result.history).toMatchObject({ actor: "user_via_ai", ops: [DECOR_CUT] });
    expect(result.proposal.items[0].status).toBe("accepted");
  });

  it("keeps the version on a decline, touching only dismissed idea titles", () => {
    const event = wedding();
    const idea: PlanOperation = {
      type: "add_idea",
      idea: {
        title: "Lantern walk",
        description: "",
        category: "decor",
        estimatedCost: null,
        costBasis: "per event",
        basis: [],
        effort: "diy",
      },
    };
    const declined = decide(event, proposalOf([idea]), [{ itemId: "i1", action: "decline" }], clock);
    expect(declined.history).toBeNull();
    expect(declined.event.version).toBe(event.version);
    expect(declined.event.dismissedIdeaTitles).toContain("lantern walk");
    expect(declined.event.updatedAt).toBe(clock.now);
    const cut = decide(event, proposalOf([DECOR_CUT]), [{ itemId: "i1", action: "decline" }], clock);
    expect(cut.event.updatedAt).toBe(event.updatedAt);
  });
});

describe("markReviewed", () => {
  it("sets one section without a version bump; nothing to do on plans without review", () => {
    const event = { ...wedding(), review: { budget: "pending", timeline: "pending", vendors: "pending", ideas: "pending" } } as const;
    const next = markReviewed(event, "budget", "reviewed", clock.now);
    expect(next?.review?.budget).toBe("reviewed");
    expect(next?.version).toBe(event.version);
    expect(markReviewed(wedding(), "budget", "reviewed", clock.now)).toBeNull();
  });
});

describe("pendingStats", () => {
  const proposal = (expireAt: string, statuses: Proposal["items"][number]["status"][]): Proposal => ({
    ...proposalOf(statuses.map(() => DECOR_CUT)),
    expireAt,
    items: statuses.map((status, i) => ({ id: `i${i}`, op: DECOR_CUT, summary: "", dependsOn: [], status, rationale: "" })),
  });

  it("counts pending items in unexpired proposals, with the latest expiry", () => {
    const stats = pendingStats(
      [
        proposal("2026-10-29T06:00:00.000Z", ["pending", "accepted"]),
        proposal("2026-10-29T08:00:00.000Z", ["pending", "pending"]),
        proposal("2026-10-28T05:00:00.000Z", ["pending"]),
      ],
      clock.now,
    );
    expect(stats).toEqual({ count: 3, expireAt: "2026-10-29T08:00:00.000Z" });
    expect(pendingStats([proposal("2026-10-30T00:00:00.000Z", ["declined"])], clock.now)).toEqual({ count: 0, expireAt: null });
  });
});

describe("history helpers", () => {
  it("label the first op and count the rest", () => {
    const event = wedding();
    expect(historyLabel(event, [], clock.today)).toBe("Plan updated");
    expect(historyLabel(event, [DECOR_CUT], clock.today)).not.toMatch(/more/);
    expect(historyLabel(event, [DECOR_CUT, DECOR_CUT], clock.today)).toMatch(/and 1 more change$/);
    expect(historyLabel(event, [DECOR_CUT, DECOR_CUT, DECOR_CUT], clock.today)).toMatch(/and 2 more changes$/);
  });

  it("snapshot only the sections that differ", () => {
    const event = wedding();
    expect(changedSections(event, { ...event, summary: { text: "New", origin: "user" } })).toEqual({ summary: event.summary });
  });
});
