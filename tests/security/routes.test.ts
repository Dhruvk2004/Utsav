// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { deleteAccount } from "@/lib/server/handlers/account";
import { draftEnquiry } from "@/lib/server/handlers/ai/enquiry";
import { suggestIdeas } from "@/lib/server/handlers/ai/ideas";
import { instructEvent } from "@/lib/server/handlers/ai/instruct";
import { smartReplan } from "@/lib/server/handlers/ai/whatif";
import { eventCalendar } from "@/lib/server/handlers/calendar";
import { decideProposal } from "@/lib/server/handlers/decide";
import { deleteEvent, getEvent, patchEvent } from "@/lib/server/handlers/event";
import { createEvent, listEvents } from "@/lib/server/handlers/events";
import { putProfile } from "@/lib/server/handlers/profile";
import { createProposal } from "@/lib/server/handlers/proposals";
import { putReview } from "@/lib/server/handlers/review";
import { createSession, deleteSession } from "@/lib/server/handlers/session";
import { revokeShare, shareEvent } from "@/lib/server/handlers/share";
import { undo } from "@/lib/server/handlers/undo";
import { cleanMultilineText, cleanText } from "@/lib/domain/schemas";
import type { Proposal } from "@/lib/domain/model/records";
import { demoInstruct } from "@/lib/server/handlers/demo/instruct";
import { MAX_EVENTS_PER_USER } from "@/lib/server/handlers/events";
import { MAX_STORED_PROPOSALS } from "@/lib/server/handlers/proposals";
import { mimeType } from "@/lib/server/http";
import { EventRepo, eventPath, isDocId, proposalsPath } from "@/lib/server/repos/events";
import { wedding } from "../domainFixtures";
import { call, fakeModel } from "../helpers/fakeModel";
import { apiRequest, bodyOf, createRequest, ORIGIN, params, sessionCookie, testDeps, type TestDeps } from "../helpers/server";

/**
 * Penetration-test regressions (docs/qa-report.md, "Penetration test"): authorization (IDOR) and
 * CSRF on every signed-in route handler, and request validation (mass assignment, prototype keys,
 * size limits). Each SEC-xx test was an `it.fails` marker for a confirmed finding; the findings
 * are fixed, so they are ordinary tests now.
 */

const A = "owner-a";
const B = "intruder-b";

async function seeded(): Promise<{ deps: TestDeps; id: string; pid: string; version: number }> {
  const deps = testDeps({
    model: fakeModel({ tools: [[call("add_task", { title: "Book a dhol player", category: "Entertainment", daysBefore: 30 })]] }),
  });
  const id = await new EventRepo(deps.db).create({ ...wedding(), ownerUid: A }, null);
  const event = (await new EventRepo(deps.db).get(id))!;
  const created = await createProposal(
    apiRequest("POST", `/api/events/${id}/proposals`, {
      cookie: sessionCookie(A),
      body: {
        touchpoint: "add_to_plan",
        baseVersion: event.version,
        items: [{ op: { type: "add_task", title: "Hire a mehndi artist", category: "Decor", daysBefore: 20 } }],
      },
    }),
    deps,
    params({ id }),
  );
  const { proposal } = (await created.json()) as { proposal: { id: string } };
  return { deps, id, pid: proposal.id, version: event.version };
}

type Call = (deps: TestDeps, request: Request, id: string, pid: string) => Promise<Response>;
interface Route {
  name: string;
  method: string;
  path: (id: string, pid: string) => string;
  body?: (version: number) => unknown;
  handler: Call;
  write: boolean;
}

const idOnly =
  (fn: (request: Request, deps: TestDeps, params: Promise<{ id: string }>) => Promise<Response>): Call =>
  (deps, request, id) =>
    fn(request, deps, params({ id }));

/** Every event-scoped route handler in src/app/api/events/[id]. */
const EVENT_ROUTES: Route[] = [
  { name: "GET event", method: "GET", path: (id) => `/api/events/${id}`, handler: idOnly(getEvent), write: false },
  { name: "GET calendar.ics", method: "GET", path: (id) => `/api/events/${id}/calendar.ics`, handler: idOnly(eventCalendar), write: false },
  {
    name: "PATCH event",
    method: "PATCH",
    path: (id) => `/api/events/${id}`,
    body: (v) => ({ baseVersion: v, ops: [{ type: "set_summary", text: "pwned" }] }),
    handler: idOnly(patchEvent),
    write: true,
  },
  {
    name: "DELETE event",
    method: "DELETE",
    path: (id) => `/api/events/${id}`,
    body: () => ({ confirmTitle: wedding().details.title }),
    handler: idOnly(deleteEvent),
    write: true,
  },
  {
    name: "POST undo",
    method: "POST",
    path: (id) => `/api/events/${id}/undo`,
    body: () => ({ historyId: "creation" }),
    handler: idOnly(undo),
    write: true,
  },
  {
    name: "PUT review",
    method: "PUT",
    path: (id) => `/api/events/${id}/review`,
    body: () => ({ section: "budget", state: "reviewed" }),
    handler: idOnly(putReview),
    write: true,
  },
  {
    name: "POST share",
    method: "POST",
    path: (id) => `/api/events/${id}/share`,
    body: () => ({ showAmounts: true, showNotes: true }),
    handler: idOnly(shareEvent),
    write: true,
  },
  { name: "DELETE share", method: "DELETE", path: (id) => `/api/events/${id}/share`, handler: idOnly(revokeShare), write: true },
  {
    name: "POST proposals",
    method: "POST",
    path: (id) => `/api/events/${id}/proposals`,
    body: (v) => ({
      touchpoint: "add_to_plan",
      baseVersion: v,
      items: [{ op: { type: "add_task", title: "x", category: "y", daysBefore: 3 } }],
    }),
    handler: idOnly(createProposal),
    write: true,
  },
  {
    name: "POST decide",
    method: "POST",
    path: (id, pid) => `/api/events/${id}/proposals/${pid}/decide`,
    body: (v) => ({ baseVersion: v, decisions: [{ itemId: "item-1", action: "accept" }] }),
    handler: (deps, request, id, pid) => decideProposal(request, deps, params({ id, pid })),
    write: true,
  },
  {
    name: "POST ai/instruct",
    method: "POST",
    path: (id) => `/api/events/${id}/ai/instruct`,
    body: () => ({ instruction: "Plan the extras" }),
    handler: idOnly(instructEvent),
    write: true,
  },
  {
    name: "POST ai/ideas",
    method: "POST",
    path: (id) => `/api/events/${id}/ai/ideas`,
    body: () => ({}),
    handler: idOnly(suggestIdeas),
    write: true,
  },
  {
    name: "POST ai/whatif",
    method: "POST",
    path: (id) => `/api/events/${id}/ai/whatif`,
    body: () => ({ newTotal: 2_000_000 }),
    handler: idOnly(smartReplan),
    write: true,
  },
  {
    name: "POST ai/enquiry",
    method: "POST",
    path: (id) => `/api/events/${id}/ai/enquiry`,
    body: () => ({ vendorId: "vendor-caterer", channel: "email", language: "en", tone: "warm", includeBudget: true, questions: [] }),
    handler: idOnly(draftEnquiry),
    write: true,
  },
];

function send(
  route: Route,
  id: string,
  pid: string,
  version: number,
  options: { cookie?: string | null; origin?: string | null; headers?: Record<string, string> } = {},
) {
  return apiRequest(route.method, route.path(id, pid), {
    body: route.body?.(version),
    cookie: options.cookie ?? sessionCookie(A),
    origin: options.origin === undefined ? ORIGIN : options.origin,
    headers: options.headers,
  });
}

describe("authorization: user B never reaches user A's event (IDOR)", () => {
  it.each(EVENT_ROUTES.map((route) => [route.name, route] as const))("%s answers B with 404 and changes nothing", async (_, route) => {
    const { deps, id, pid, version } = await seeded();
    const before = structuredClone([...deps.db.docs.entries()]);
    const response = await route.handler(deps, send(route, id, pid, version, { cookie: sessionCookie(B) }), id, pid);
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain(wedding().details.title);
    expect([...deps.db.docs.entries()]).toEqual(before);
  });

  it.each(EVENT_ROUTES.map((route) => [route.name, route] as const))("%s answers 401 without a session", async (_, route) => {
    const { deps, id, pid, version } = await seeded();
    const response = await route.handler(deps, send(route, id, pid, version, { cookie: "" }), id, pid);
    expect(response.status).toBe(401);
  });

  it("a proposal id from another event cannot be decided through one's own event", async () => {
    const { deps, id: eventA, pid } = await seeded();
    const eventB = await new EventRepo(deps.db).create({ ...wedding(), ownerUid: B }, null);
    const version = (await new EventRepo(deps.db).get(eventB))!.version;
    const response = await decideProposal(
      apiRequest("POST", `/api/events/${eventB}/proposals/${pid}/decide`, {
        cookie: sessionCookie(B),
        body: { baseVersion: version, decisions: [{ itemId: "item-1", action: "accept" }] },
      }),
      deps,
      params({ id: eventB, pid }),
    );
    expect(response.status).toBe(404);
    expect((await new EventRepo(deps.db).get(eventA))!.tasks.some((task) => task.title === "Hire a mehndi artist")).toBe(false);
  });

  it("the dashboard lists only the caller's own events", async () => {
    const { deps } = await seeded();
    const response = await listEvents(apiRequest("GET", "/api/events", { cookie: sessionCookie(B) }), deps);
    expect(await bodyOf(response)).toEqual({ events: [] });
  });
});

describe("CSRF: every mutation needs the app's exact Origin (spec 9.1)", () => {
  const writes = EVENT_ROUTES.filter((route) => route.write);
  const ORIGINS: [string, string | null][] = [
    ["no Origin", null],
    ["another site", "https://evil.example"],
    ["the literal null origin", "null"],
    ["a trailing slash", `${ORIGIN}/`],
    ["another scheme", ORIGIN.replace("https:", "http:")],
    ["a subdomain", ORIGIN.replace("://", "://evil.")],
  ];

  it.each(writes.flatMap((route) => ORIGINS.map(([label, origin]) => [route.name, label, route, origin] as const)))(
    "%s with %s is 403 and changes nothing",
    async (_, __, route, origin) => {
      const { deps, id, pid, version } = await seeded();
      const before = structuredClone([...deps.db.docs.entries()]);
      const response = await route.handler(deps, send(route, id, pid, version, { origin }), id, pid);
      expect(response.status).toBe(403);
      expect([...deps.db.docs.entries()]).toEqual(before);
    },
  );

  it("a Referer or Sec-Fetch-Site header never stands in for Origin", async () => {
    const { deps, id, pid, version } = await seeded();
    const patch = EVENT_ROUTES.find((route) => route.name === "PATCH event")!;
    const response = await patch.handler(
      deps,
      send(patch, id, pid, version, { origin: null, headers: { referer: `${ORIGIN}/events/${id}`, "sec-fetch-site": "same-origin" } }),
      id,
      pid,
    );
    expect(response.status).toBe(403);
  });

  it.each([
    [
      "POST /api/events",
      (deps: TestDeps, origin: string | null) =>
        createEvent(apiRequest("POST", "/api/events", { body: createRequest({ mode: "blank" }), cookie: sessionCookie(A), origin }), deps),
    ],
    [
      "PUT /api/profile",
      (deps: TestDeps, origin: string | null) =>
        putProfile(apiRequest("PUT", "/api/profile", { body: { displayName: "X" }, cookie: sessionCookie(A), origin }), deps),
    ],
    [
      "DELETE /api/account",
      (deps: TestDeps, origin: string | null) =>
        deleteAccount(apiRequest("DELETE", "/api/account", { body: { confirm: "DELETE" }, cookie: sessionCookie(A), origin }), deps),
    ],
    [
      "POST /api/session",
      (deps: TestDeps, origin: string | null) =>
        createSession(
          apiRequest("POST", "/api/session", {
            body: { idToken: `id:${A}:${Date.parse("2026-10-28T06:00:00.000Z") / 1000}` },
            cookie: null,
            origin,
          }),
          deps,
        ),
    ],
    [
      "DELETE /api/session",
      (deps: TestDeps, origin: string | null) =>
        deleteSession(apiRequest("DELETE", "/api/session", { cookie: sessionCookie(A), origin }), deps),
    ],
  ] as const)("%s refuses a cross-site Origin (login CSRF and sign-out CSRF included)", async (_, run) => {
    const deps = testDeps();
    expect((await run(deps, "https://evil.example")).status).toBe(403);
    expect((await run(deps, null)).status).toBe(403);
    expect(deps.db.docs.size).toBe(0);
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"])(
    "a form-encodable content type (%s) is 415",
    async (type) => {
      const { deps, id, version } = await seeded();
      const request = new Request(`${ORIGIN}/api/events/${id}`, {
        method: "PATCH",
        headers: { origin: ORIGIN, cookie: sessionCookie(A), "content-type": type },
        body: JSON.stringify({ baseVersion: version, ops: [{ type: "set_summary", text: "x" }] }),
      });
      expect((await patchEvent(request, deps, params({ id }))).status).toBe(415);
    },
  );

  it.each([
    "text/plain; charset=application/json",
    "text/plain;application/json",
    "application/jsonx",
    "application/json-patch+json",
    "multipart/form-data; boundary=application/json",
  ])("SEC-07: %s (only mentions application/json) is 415 and changes nothing", async (type) => {
    const { deps, id, version } = await seeded();
    const before = structuredClone([...deps.db.docs.entries()]);
    const request = new Request(`${ORIGIN}/api/events/${id}`, {
      method: "PATCH",
      headers: { origin: ORIGIN, cookie: sessionCookie(A), "content-type": type },
      body: JSON.stringify({ baseVersion: version, ops: [{ type: "set_summary", text: "x" }] }),
    });
    expect((await patchEvent(request, deps, params({ id }))).status).toBe(415);
    expect([...deps.db.docs.entries()]).toEqual(before);
  });

  it.each(["application/json", "application/json; charset=utf-8", "Application/JSON ; charset=UTF-8"])(
    "SEC-07: the JSON type %j is accepted",
    async (type) => {
      const { deps, id, version } = await seeded();
      const request = new Request(`${ORIGIN}/api/events/${id}`, {
        method: "PATCH",
        headers: { origin: ORIGIN, cookie: sessionCookie(A), "content-type": type },
        body: JSON.stringify({ baseVersion: version, ops: [{ type: "set_summary", text: "x" }] }),
      });
      expect((await patchEvent(request, deps, params({ id }))).status).toBe(200);
    },
  );

  it("SEC-07: the public demo refuses a CORS-safelisted text/plain body too", async () => {
    const deps = testDeps();
    const request = new Request(`${ORIGIN}/api/demo/wedding/ai/instruct`, {
      method: "POST",
      headers: { "content-type": "text/plain; charset=application/json" },
      body: JSON.stringify({ instruction: "hi", appliedOps: [] }),
    });
    expect((await demoInstruct(request, deps, params({ sample: "wedding" }))).status).toBe(415);
    expect(mimeType(null)).toBe("");
  });
});

describe("input validation and mass assignment", () => {
  it.each([
    ["ownerUid", { ownerUid: B }],
    ["version", { version: 99 }],
    ["source", { source: "ai" }],
    ["share", { share: { active: true } }],
  ])("POST /api/events refuses an extra %s field", async (_, extra) => {
    const deps = testDeps();
    const response = await createEvent(
      apiRequest("POST", "/api/events", { body: { ...createRequest({ mode: "blank" }), ...extra }, cookie: sessionCookie(A) }),
      deps,
    );
    expect(response.status).toBe(400);
    expect(deps.db.docs.size).toBe(0);
  });

  it.each([
    ["__proto__", `{"__proto__":{"polluted":true},"displayName":"P"}`],
    ["constructor", `{"constructor":{"prototype":{"polluted":true}},"displayName":"P"}`],
    ["aiUsage (quota reset)", `{"aiUsage":{"day":"2026-10-28","count":-1000}}`],
    ["email", `{"email":"someone@else.example"}`],
    ["onboardedAt", `{"onboardedAt":"2020-01-01T00:00:00.000Z"}`],
  ])("PUT /api/profile refuses a %s key and pollutes no prototype", async (_, raw) => {
    const deps = testDeps();
    const request = new Request(`${ORIGIN}/api/profile`, {
      method: "PUT",
      headers: { origin: ORIGIN, cookie: sessionCookie(A), "content-type": "application/json" },
      body: raw,
    });
    expect((await putProfile(request, deps)).status).toBe(400);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each([
    [
      "add_idea with origin/source",
      {
        type: "add_idea",
        idea: {
          title: "x",
          description: "",
          category: "decor",
          estimatedCost: null,
          costBasis: "per event",
          basis: [],
          effort: "diy",
          origin: "ai",
          source: "ai",
        },
      },
    ],
    ["update_vendor with origin", { type: "update_vendor", vendorId: "vendor-caterer", patch: { notes: "n", origin: "ai" } }],
    ["a __proto__ key in an op", JSON.parse(`{"type":"set_summary","text":"x","__proto__":{"admin":true}}`)],
    ["an unknown op type", { type: "set_owner", ownerUid: B }],
  ])("PATCH refuses %s", async (_, op) => {
    const { deps, id, version } = await seeded();
    const response = await patchEvent(
      apiRequest("PATCH", `/api/events/${id}`, { body: { baseVersion: version, ops: [op] }, cookie: sessionCookie(A) }),
      deps,
      params({ id }),
    );
    expect(response.status).toBe(400);
  });

  it("a save_draft with a forged generatedDraftId is stored as the user's own draft", async () => {
    const { deps, id, version } = await seeded();
    const op = {
      type: "save_draft",
      vendorId: "vendor-caterer",
      draft: { channel: "email", language: "en", subject: "s", body: "b" },
      generatedDraftId: "forged",
    };
    const response = await patchEvent(
      apiRequest("PATCH", `/api/events/${id}`, { body: { baseVersion: version, ops: [op] }, cookie: sessionCookie(A) }),
      deps,
      params({ id }),
    );
    expect(response.status).toBe(200);
    const event = (await new EventRepo(deps.db).get(id))!;
    expect(event.vendors.find((vendor) => vendor.id === "vendor-caterer")!.drafts.at(-1)!.origin).toBe("user");
  });

  it("an edited AI card cannot swap in another op type or a non-proposable op", async () => {
    const { deps, id, pid, version } = await seeded();
    for (const editedOp of [
      { type: "set_total_budget", total: 100_000, strategy: "rescale" },
      { type: "set_summary", text: "x" },
    ]) {
      const response = await decideProposal(
        apiRequest("POST", `/api/events/${id}/proposals/${pid}/decide`, {
          body: { baseVersion: version, decisions: [{ itemId: "item-1", action: "accept", editedOp }] },
          cookie: sessionCookie(A),
        }),
        deps,
        params({ id, pid }),
      );
      expect(((await response.json()) as { results: { ok: boolean }[] }).results[0].ok).toBe(false);
    }
    expect((await new EventRepo(deps.db).get(id))!.version).toBe(version);
  });

  it("a code proposal never carries a user-only op and its origin is always code", async () => {
    const { deps, id, version } = await seeded();
    const post = (body: unknown) =>
      createProposal(apiRequest("POST", `/api/events/${id}/proposals`, { body, cookie: sessionCookie(A) }), deps, params({ id }));
    expect((await post({ touchpoint: "instruct", baseVersion: version, items: [{ op: { type: "set_summary", text: "x" } }] })).status).toBe(
      400,
    );
    expect(
      (
        await post({
          touchpoint: "instruct",
          baseVersion: version,
          origin: "ai",
          items: [{ op: { type: "add_task", title: "t", category: "c", daysBefore: 3 } }],
        })
      ).status,
    ).toBe(400);
    const stored = await post({
      touchpoint: "instruct",
      baseVersion: version,
      items: [{ op: { type: "add_task", title: "t", category: "c", daysBefore: 3 } }],
    });
    expect(((await stored.json()) as { proposal: { origin: string } }).proposal.origin).toBe("code");
  });

  it("body limits count bytes, not characters (16 KB for edits, 10 KB elsewhere)", async () => {
    const { deps, id, version } = await seeded();
    const patch = (text: string) =>
      patchEvent(
        apiRequest("PATCH", `/api/events/${id}`, {
          body: { baseVersion: version, ops: Array.from({ length: 30 }, () => ({ type: "set_summary", text })) },
          cookie: sessionCookie(A),
        }),
        deps,
        params({ id }),
      );
    expect((await patch("😀".repeat(140))).status).toBe(413);
    const share = await shareEvent(
      apiRequest("POST", `/api/events/${id}/share`, {
        body: { showAmounts: true, showNotes: true, pad: "x".repeat(10_001) },
        cookie: sessionCookie(A),
      }),
      deps,
      params({ id }),
    );
    expect(share.status).toBe(413);
  });

  it("deeply nested or huge arrays are refused before any write", async () => {
    const { deps, id, version } = await seeded();
    const many = Array.from({ length: 51 }, () => ({ type: "set_summary", text: "x" }));
    expect(
      (
        await patchEvent(
          apiRequest("PATCH", `/api/events/${id}`, { body: { baseVersion: version, ops: many }, cookie: sessionCookie(A) }),
          deps,
          params({ id }),
        )
      ).status,
    ).toBe(400);
    const deep = new Request(`${ORIGIN}/api/events/${id}`, {
      method: "PATCH",
      headers: { origin: ORIGIN, cookie: sessionCookie(A), "content-type": "application/json" },
      body: "[".repeat(5000) + "]".repeat(5000),
    });
    expect((await patchEvent(deep, deps, params({ id }))).status).toBe(400);
  });

  it("control characters are cleaned from free text before storage", async () => {
    const deps = testDeps();
    const response = await createEvent(
      apiRequest("POST", "/api/events", {
        body: createRequest({ mode: "blank", city: "Pune\u0000\u001b[31m\r\nX", title: "T\r\nBEGIN:VEVENT" }),
        cookie: sessionCookie(A),
      }),
      deps,
    );
    const { eventId } = (await response.json()) as { eventId: string };
    const event = (await new EventRepo(deps.db).get(eventId))!;
    expect(event.details.city).not.toMatch(/[\u0000-\u001f]/);
    expect(event.details.title).not.toMatch(/[\r\n]/);
  });

  it("SEC-08: bidirectional override characters (U+202E) are removed from free text", async () => {
    const deps = testDeps();
    const response = await createEvent(
      apiRequest("POST", "/api/events", { body: createRequest({ mode: "blank", city: "Pune ‮txt.exe" }), cookie: sessionCookie(A) }),
      deps,
    );
    const { eventId } = (await response.json()) as { eventId: string };
    expect((await new EventRepo(deps.db).get(eventId))!.details.city).not.toMatch(/[‪-‮⁦-⁩]/);
    expect((await new EventRepo(deps.db).get(eventId))!.details.city).toBe("Pune txt.exe");
  });

  it("SEC-08: cleanText removes every bidi control and direction mark but keeps the joiners Indic scripts and emoji need", () => {
    expect(cleanText("a\u202Ab\u202Bc\u202Cd\u202De\u202Ef\u2066g\u2067h\u2068i\u2069j\u200Ek\u200Fl\u061Cm")).toBe("abcdefghijklm");
    expect(cleanText("क्\u200Dष 👩\u200D👩\u200D👧")).toBe("क्\u200Dष 👩\u200D👩\u200D👧");
    expect(cleanMultilineText(" Hi\r\nthere\u202E\r\n\r\nThanks\u0007 ")).toBe("Hi\nthere\n\nThanks");
  });

  it("SEC-08: AI instructions, code-proposal text and draft bodies are cleaned before they are stored", async () => {
    const { deps, id, version } = await seeded();
    const post = await createProposal(
      apiRequest("POST", `/api/events/${id}/proposals`, {
        cookie: sessionCookie(A),
        body: {
          touchpoint: "instruct",
          baseVersion: version,
          instruction: "Plan\u202E\u0000 it",
          items: [{ op: { type: "add_task", title: "t", category: "c", daysBefore: 3 }, rationale: "why\u2066 not" }],
        },
      }),
      deps,
      params({ id }),
    );
    const { proposal } = (await post.json()) as { proposal: Proposal };
    expect(proposal.instruction).toBe("Plan it");
    expect(proposal.items[0].rationale).toBe("why not");
    const op = {
      type: "save_draft",
      vendorId: "vendor-caterer",
      draft: { channel: "email", language: "en", subject: "Hi\u202E", body: "Dear team,\r\nPlease quote.\u202E\r\n\r\nThanks" },
    };
    const saved = await patchEvent(
      apiRequest("PATCH", `/api/events/${id}`, { body: { baseVersion: version, ops: [op] }, cookie: sessionCookie(A) }),
      deps,
      params({ id }),
    );
    expect(saved.status).toBe(200);
    const draft = (await new EventRepo(deps.db).get(id))!.vendors.find((vendor) => vendor.id === "vendor-caterer")!.drafts.at(-1)!;
    expect(draft.subject).toBe("Hi");
    expect(draft.body).toBe("Dear team,\nPlease quote.\n\nThanks");
  });

  it("SEC-08: an AI-mode instruction that is only control characters is refused", async () => {
    const { deps, id } = await seeded();
    const response = await instructEvent(
      apiRequest("POST", `/api/events/${id}/ai/instruct`, { body: { instruction: "\u202E\u0000 " }, cookie: sessionCookie(A) }),
      deps,
      params({ id }),
    );
    expect(response.status).toBe(400);
  });

  it.each(EVENT_ROUTES.map((route) => [route.name, route] as const))(
    "SEC-06: %s answers 404 for a malformed event id before any database call",
    async (_, route) => {
      const { deps, id, pid, version } = await seeded();
      const get = vi.spyOn(deps.db, "get");
      const transaction = vi.spyOn(deps.db, "transaction");
      const before = structuredClone([...deps.db.docs.entries()]);
      for (const bad of [`${id}/history/creation`, "__reserved__", "../users/x", "..", "a.b", "x".repeat(41), ""]) {
        const response = await route.handler(deps, send(route, bad, pid, version), bad, pid);
        expect(response.status, bad).toBe(404);
      }
      expect(get).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
      expect([...deps.db.docs.entries()]).toEqual(before);
    },
  );

  it("SEC-06: a malformed proposal id or history id is a 404 too", async () => {
    const { deps, id, pid, version } = await seeded();
    const before = structuredClone([...deps.db.docs.entries()]);
    for (const bad of [`${pid}/x`, "__x__", "../proposals", "a.b"]) {
      const decided = await decideProposal(
        apiRequest("POST", `/api/events/${id}/proposals/x/decide`, {
          body: { baseVersion: version, decisions: [{ itemId: "item-1", action: "accept" }] },
          cookie: sessionCookie(A),
        }),
        deps,
        params({ id, pid: bad }),
      );
      expect(decided.status, bad).toBe(404);
      const undone = await undo(
        apiRequest("POST", `/api/events/${id}/undo`, { body: { historyId: bad }, cookie: sessionCookie(A) }),
        deps,
        params({ id }),
      );
      expect(undone.status, bad).toBe(404);
    }
    expect([...deps.db.docs.entries()]).toEqual(before);
    expect(isDocId("AbC123xyz0AbC123xyz0")).toBe(true);
    expect(isDocId("events-12")).toBe(true);
  });

  it("SEC-06: an event id with a slash or a reserved name is a 404 without a Firestore path built from it", async () => {
    const { deps, id } = await seeded();
    const get = vi.spyOn(deps.db, "get");
    for (const bad of [`${id}/history/creation`, "__reserved__", "../users/x"]) {
      const response = await getEvent(
        apiRequest("GET", `/api/events/${encodeURIComponent(bad)}`, { cookie: sessionCookie(A) }),
        deps,
        params({ id: bad }),
      );
      expect(response.status).toBe(404);
    }
    expect(get.mock.calls.map(([path]) => path)).not.toContainEqual(expect.stringMatching(/^events\/.+\/.+/));
    expect(get.mock.calls.map(([path]) => path)).not.toContain(eventPath("__reserved__"));
  });
});

describe("SEC-12: per-account storage caps", () => {
  it(`an account keeps at most ${MAX_EVENTS_PER_USER} events`, async () => {
    const deps = testDeps();
    const repo = new EventRepo(deps.db);
    for (let i = 0; i < MAX_EVENTS_PER_USER - 1; i++) await repo.create({ ...wedding(), ownerUid: A }, null);
    await repo.create({ ...wedding(), ownerUid: B }, null);
    const create = () =>
      createEvent(apiRequest("POST", "/api/events", { body: createRequest({ mode: "blank" }), cookie: sessionCookie(A) }), deps);
    expect((await create()).status).toBe(201);
    const refused = await create();
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: { code: string; message: string } }).error).toMatchObject({
      code: "event_limit",
      message: expect.stringContaining(String(MAX_EVENTS_PER_USER)),
    });
    expect(await repo.ownedIds(A)).toHaveLength(MAX_EVENTS_PER_USER);
    // Another account is not affected.
    expect(
      (await createEvent(apiRequest("POST", "/api/events", { body: createRequest({ mode: "blank" }), cookie: sessionCookie(B) }), deps))
        .status,
    ).toBe(201);
  });

  it(`an event keeps at most ${MAX_STORED_PROPOSALS} proposals: the oldest go first, and the pending count follows`, async () => {
    const { deps, id, pid } = await seeded();
    const stored = () => [...deps.db.docs.keys()].filter((path) => path.startsWith(`${proposalsPath(id)}/`));
    let created: string[] = [pid];
    for (let i = 0; i < MAX_STORED_PROPOSALS + 4; i++) {
      const version = (await new EventRepo(deps.db).get(id))!.version;
      const response = await createProposal(
        apiRequest("POST", `/api/events/${id}/proposals`, {
          cookie: sessionCookie(A),
          body: {
            touchpoint: "add_to_plan",
            baseVersion: version,
            items: [{ op: { type: "add_task", title: `Task ${i}`, category: "Decor", daysBefore: 20 } }],
          },
        }),
        deps,
        params({ id }),
      );
      expect(response.status).toBe(201);
      created = [...created, ((await response.json()) as { proposal: { id: string } }).proposal.id];
    }
    expect(stored()).toHaveLength(MAX_STORED_PROPOSALS);
    expect(stored().sort()).toEqual(
      created
        .slice(-MAX_STORED_PROPOSALS)
        .map((p) => `${proposalsPath(id)}/${p}`)
        .sort(),
    );
    expect((await new EventRepo(deps.db).get(id))!.stats.pending.count).toBe(MAX_STORED_PROPOSALS);
  });
});
