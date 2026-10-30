// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseRupees } from "@/lib/client/money";
import { buildIcs, foldLine } from "@/lib/domain/ics";
import type { EventDoc } from "@/lib/domain/model/event";
import type { Proposal } from "@/lib/domain/model/records";
import { planInvariantViolations } from "@/lib/domain/invariants";
import { todayInIndia } from "@/lib/domain/dates";
import { encodeTimestamps } from "@/lib/server/db/timestamps";
import { eventCalendar } from "@/lib/server/handlers/calendar";
import { decideProposal } from "@/lib/server/handlers/decide";
import { getEvent, patchEvent } from "@/lib/server/handlers/event";
import { createEvent } from "@/lib/server/handlers/events";
import { createProposal } from "@/lib/server/handlers/proposals";
import { shareEvent } from "@/lib/server/handlers/share";
import { undo } from "@/lib/server/handlers/undo";
import { sharedPlanFor } from "@/lib/server/loaders/share";
import { EventRepo } from "@/lib/server/repos/events";
import { DECOR_CUT } from "../contracts/planStoreContract";
import { apiRequest, bodyOf, createRequest, params, sessionCookie, testDeps, TODAY, type TestDeps } from "../helpers/server";

/**
 * Integration through the real module seams: route handler -> repository -> `applyOperations` ->
 * invariants -> `MemoryDb` (which now mirrors Firestore's undefined handling and optimistic
 * concurrency). Each test starts from `POST /api/events`, as the wizard does, rather than a fixture
 * written straight into the database. `it.fails` marks a known bug from docs/qa-report.md: it turns
 * red when the bug is fixed, so the marker is then removed.
 */

type Created = { deps: TestDeps; id: string; event: EventDoc };

async function created(overrides: Parameters<typeof createRequest>[0] = {}, deps = testDeps(), uid = "u1"): Promise<Created> {
  const response = await createEvent(
    apiRequest("POST", "/api/events", { body: createRequest(overrides), cookie: sessionCookie(uid) }),
    deps,
  );
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
  const { eventId } = (await bodyOf(response)) as { eventId: string };
  return { deps, id: eventId, event: (await new EventRepo(deps.db).get(eventId)) as EventDoc };
}

const patch = (deps: TestDeps, id: string, baseVersion: number, ops: unknown[]) =>
  patchEvent(apiRequest("PATCH", `/api/events/${id}`, { body: { baseVersion, ops } }), deps, params({ id }));

const decorLine = (event: EventDoc) => event.budget.lines.find((l) => l.category === "Decor") as EventDoc["budget"]["lines"][number];

async function codeProposal(deps: TestDeps, id: string, baseVersion: number, items: unknown[]): Promise<Proposal & { id: string }> {
  const response = await createProposal(
    apiRequest("POST", `/api/events/${id}/proposals`, { body: { touchpoint: "add_to_plan", baseVersion, items } }),
    deps,
    params({ id }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { proposal: Proposal & { id: string } }).proposal;
}

const decide = (deps: TestDeps, id: string, pid: string, body: unknown) =>
  decideProposal(apiRequest("POST", `/api/events/${id}/proposals/${pid}/decide`, { body }), deps, params({ id, pid }));

describe("create -> edit -> decide -> undo through the handlers", () => {
  it("keeps every plan invariant after each stored write", async () => {
    const { deps, id, event } = await created();
    expect(planInvariantViolations(event)).toEqual([]);
    const decor = decorLine(event);
    const edited = await patch(deps, id, event.version, [
      { type: "adjust_budget_category", lineId: decor.id, mode: "set_amount", value: decor.amount - 10_000, rebalance: "spread_to_others" },
    ]);
    expect(edited.status).toBe(200);
    const after = (await new EventRepo(deps.db).get(id)) as EventDoc;
    expect(after.version).toBe(event.version + 1);
    expect(after.budget.total).toBe(event.budget.total);
    expect(planInvariantViolations(after)).toEqual([]);
  });

  it("serialises two writes from the same base version: one 200, one 409 with the winner's plan", async () => {
    const { deps, id, event } = await created();
    const [a, b] = await Promise.all([
      patch(deps, id, event.version, [{ type: "set_summary", text: "A" }]),
      patch(deps, id, event.version, [{ type: "set_summary", text: "B" }]),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = (await bodyOf(a.status === 409 ? a : b)) as { event: EventDoc };
    const stored = (await new EventRepo(deps.db).get(id)) as EventDoc;
    expect(loser.event.version).toBe(stored.version);
    expect(stored.version).toBe(event.version + 1);
    expect(deps.db.retries).toBeGreaterThan(0);
  });

  it("accepts and declines cards, then undoes the accepted batch", async () => {
    const { deps, id, event } = await created();
    const decor = decorLine(event);
    const proposal = await codeProposal(deps, id, event.version, [
      { op: { type: "adjust_budget_category", lineId: decor.id, mode: "percent_change", value: -20, rebalance: "change_total" } },
      { op: { type: "add_task", title: "Book a dhol player", category: "Entertainment", daysBefore: 30 } },
    ]);
    const response = await decide(deps, id, proposal.id, {
      baseVersion: event.version,
      decisions: [
        { itemId: "item-1", action: "accept" },
        { itemId: "item-2", action: "decline" },
      ],
    });
    expect(response.status).toBe(200);
    const { historyId } = (await bodyOf(response)) as { historyId: string };
    const after = (await new EventRepo(deps.db).get(id)) as EventDoc;
    expect(decorLine(after).amount).toBe(Math.round(decor.amount * 0.8));
    expect(after.tasks.some((t) => t.title === "Book a dhol player")).toBe(false);

    const undone = await undo(apiRequest("POST", `/api/events/${id}/undo`, { body: { historyId } }), deps, params({ id }));
    expect(undone.status).toBe(200);
    expect(decorLine((await new EventRepo(deps.db).get(id)) as EventDoc).amount).toBe(decor.amount);
  });

  it("restores a declined card (QA-01 regression: no `reason: undefined` inside `items`)", async () => {
    const { deps, id, event } = await created();
    const proposal = await codeProposal(deps, id, event.version, [
      { op: { type: "add_task", title: "Book a dhol player", category: "Entertainment", daysBefore: 30 } },
    ]);
    expect(
      (await decide(deps, id, proposal.id, { baseVersion: event.version, decisions: [{ itemId: "item-1", action: "decline" }] })).status,
    ).toBe(200);
    const restored = await decide(deps, id, proposal.id, {
      baseVersion: event.version,
      decisions: [{ itemId: "item-1", action: "restore" }],
    });
    expect(restored.status).toBe(200);
  });

  it("someone else's event is a 404 on every route, and their write changes nothing", async () => {
    const { deps, id, event } = await created();
    const cookie = sessionCookie("intruder");
    expect((await getEvent(apiRequest("GET", `/api/events/${id}`, { cookie }), deps, params({ id }))).status).toBe(404);
    expect(
      (
        await patchEvent(
          apiRequest("PATCH", `/api/events/${id}`, { cookie, body: { baseVersion: event.version, ops: [DECOR_CUT] } }),
          deps,
          params({ id }),
        )
      ).status,
    ).toBe(404);
    expect((await eventCalendar(apiRequest("GET", `/api/events/${id}/calendar.ics`, { cookie }), deps, params({ id }))).status).toBe(404);
    expect((await new EventRepo(deps.db).get(id))?.version).toBe(event.version);
  });
});

describe("edge cases (dates, sizes, scripts)", () => {
  it("accepts an event today and refuses yesterday, by the India date", async () => {
    expect((await created({ eventDate: TODAY, functions: [] })).event.details.eventDate).toBe(TODAY);
    const deps = testDeps();
    const response = await createEvent(
      apiRequest("POST", "/api/events", { body: createRequest({ eventDate: "2026-10-27", functions: [] }) }),
      deps,
    );
    expect(response.status).toBe(400);
  });

  it("rolls the India date over at 18:30 UTC, not at UTC midnight", () => {
    expect(todayInIndia(new Date("2026-10-28T18:29:59.999Z"))).toBe("2026-10-28");
    expect(todayInIndia(new Date("2026-10-28T18:30:00.000Z"))).toBe("2026-10-29");
    expect(todayInIndia(new Date("2028-02-28T18:30:00.000Z"))).toBe("2028-02-29");
  });

  it("plans a leap-day wedding: functions before it and the reception the day after", async () => {
    const { event, id } = await created(
      {
        eventDate: "2028-02-29",
        functions: [
          { name: "Sangeet", date: "2028-02-28", startTime: "19:00", endTime: "23:30", sharePercent: 30 },
          { name: "Reception", date: "2028-03-01", startTime: null, endTime: null, sharePercent: 70 },
        ],
      },
      testDepsAt("2027-03-01"),
    );
    expect(event.functions.map((f) => f.date)).toEqual(["2028-02-28", "2028-03-01"]);
    const ics = buildIcs(event, id, "2027-03-01", new Date("2027-03-01T00:00:00Z"));
    // IST is UTC+5:30: 19:00-23:30 on 28 Feb is 13:30-18:00 UTC.
    expect(ics).toContain("DTSTART:20280228T133000Z");
    expect(ics).toContain("DTEND:20280228T180000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20280229");
  });

  it("takes the 5,000-guest maximum and refuses 5,001", async () => {
    expect((await created({ guestCount: 5_000 })).event.guests.total).toBe(5_000);
    const response = await createEvent(apiRequest("POST", "/api/events", { body: createRequest({ guestCount: 5_001 }) }), testDeps());
    expect(response.status).toBe(400);
  });

  it("keeps Devanagari intact from the request to the .ics (folded on whole characters)", async () => {
    const title = "आशा और रोहन की शादी, पुणे; संगीत संध्या और विवाह समारोह";
    const { deps, id } = await created({ title });
    const response = await eventCalendar(apiRequest("GET", `/api/events/${id}/calendar.ics`), deps, params({ id }));
    const ics = await response.text();
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${title.replace(/,/g, "\\,").replace(/;/g, "\\;")}`);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(foldLine("स".repeat(40)).split("\r\n ").join("")).toBe("स".repeat(40));
  });

  it(".ics UIDs are unique across events, so a second import does not overwrite the first (QA-07 regression)", async () => {
    const deps = testDeps();
    const first = await created({}, deps);
    const second = await created({}, deps);
    const uids = ({ event, id }: { event: EventDoc; id: string }) =>
      buildIcs(event, id, TODAY)
        .split("\r\n")
        .filter((l) => l.startsWith("UID:"));
    const shared = uids(first).filter((uid) => uids(second).includes(uid));
    expect(uids(first).length).toBeGreaterThan(1);
    expect(shared).toEqual([]);
  });

  it("the share projection never carries contacts, notes, honoree names or the private title", async () => {
    const { deps, id } = await created({ title: "Ananya & Rohan's wedding" });
    const response = await shareEvent(
      apiRequest("POST", `/api/events/${id}/share`, { body: { showAmounts: false, showNotes: false } }),
      deps,
      params({ id }),
    );
    const token = ((await bodyOf(response)) as { url: string }).url.split("/s/")[1];
    const result = await sharedPlanFor(token, "198.51.100.7", deps);
    const text = JSON.stringify(result);
    expect(result.kind).toBe("found");
    for (const secret of ["Ananya", "Rohan", "Allergic to lilies", "₹"]) expect(text).not.toContain(secret);
  });
});

describe("money input", () => {
  it("groups Indian style and ignores separators people type", () => {
    expect(parseRupees("25,00,000")).toBe(2_500_000);
    expect(parseRupees("₹ 7,142")).toBe(7_142);
    expect(parseRupees("abc")).toBeNull();
  });

  it("does not turn a decimal amount into 100 times the value (QA-09 regression)", () => {
    expect(parseRupees("2,400.50")).toBe(2_400);
  });
});

describe("encodeTimestamps (QA-01 root cause)", () => {
  const codec = {
    fromIso: (iso: string) => iso,
    isTimestamp: (value: unknown): value is string => value instanceof Date,
    toIso: (iso: string) => iso,
  };

  it("drops undefined fields of plain objects", () => {
    expect(encodeTimestamps({ a: 1, b: undefined, c: { d: undefined, e: 2 } }, codec)).toEqual({ a: 1, c: { e: 2 } });
  });

  it("drops undefined fields of objects inside arrays (QA-01 regression)", () => {
    expect(
      JSON.stringify(encodeTimestamps({ items: [{ id: "i1", reason: undefined }] }, codec), (_k, v) => (v === undefined ? "UNDEFINED" : v)),
    ).not.toContain("UNDEFINED");
  });
});

function testDepsAt(today: string): TestDeps {
  return { ...testDeps(), clock: () => ({ today, now: `${today}T06:00:00.000Z` }) };
}
