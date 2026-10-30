// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { apiRequest, testDeps, type TestDeps } from "../../helpers/server";

/** Each route file re-exports a handler bound to the shared runtime; these check the bindings. */
const shared = vi.hoisted(() => ({ deps: null as TestDeps | null }));
vi.mock("@/lib/server/runtime", () => ({ runtime: () => shared.deps }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
shared.deps = testDeps();

const id = { params: Promise.resolve({ id: "e1" }) };
const sample = { params: Promise.resolve({ sample: "office" }) };
const signedOut = { cookie: null } as const;

describe("route bindings", () => {
  it.each([
    [
      "session POST",
      async () => (await import("@/lib/server/handlers/session")).POST(apiRequest("POST", "/api/session", { body: { idToken: "x" } })),
      401,
    ],
    ["session DELETE", async () => (await import("@/lib/server/handlers/session")).DELETE(apiRequest("DELETE", "/api/session")), 204],
    ["profile GET", async () => (await import("@/lib/server/handlers/profile")).GET(apiRequest("GET", "/api/profile", signedOut)), 401],
    ["profile PUT", async () => (await import("@/lib/server/handlers/profile")).PUT(apiRequest("PUT", "/api/profile", signedOut)), 401],
    [
      "account DELETE",
      async () => (await import("@/lib/server/handlers/account")).DELETE(apiRequest("DELETE", "/api/account", signedOut)),
      401,
    ],
    ["events GET", async () => (await import("@/lib/server/handlers/events")).GET(apiRequest("GET", "/api/events", signedOut)), 401],
    ["events POST", async () => (await import("@/lib/server/handlers/events")).POST(apiRequest("POST", "/api/events", signedOut)), 401],
    ["event GET", async () => (await import("@/lib/server/handlers/event")).GET(apiRequest("GET", "/api/events/e1", signedOut), id), 401],
    [
      "event PATCH",
      async () => (await import("@/lib/server/handlers/event")).PATCH(apiRequest("PATCH", "/api/events/e1", signedOut), id),
      401,
    ],
    [
      "event DELETE",
      async () => (await import("@/lib/server/handlers/event")).DELETE(apiRequest("DELETE", "/api/events/e1", signedOut), id),
      401,
    ],
    [
      "undo POST",
      async () => (await import("@/lib/server/handlers/undo")).POST(apiRequest("POST", "/api/events/e1/undo", signedOut), id),
      401,
    ],
    [
      "review PUT",
      async () => (await import("@/lib/server/handlers/review")).PUT(apiRequest("PUT", "/api/events/e1/review", signedOut), id),
      401,
    ],
    [
      "proposals POST",
      async () => (await import("@/lib/server/handlers/proposals")).POST(apiRequest("POST", "/api/events/e1/proposals", signedOut), id),
      401,
    ],
    [
      "proposals GET",
      async () => (await import("@/lib/server/handlers/proposals")).GET(apiRequest("GET", "/api/events/e1/proposals", signedOut), id),
      401,
    ],
    [
      "decide POST",
      async () =>
        (await import("@/lib/server/handlers/decide")).POST(apiRequest("POST", "/api/events/e1/proposals/p1/decide", signedOut), {
          params: Promise.resolve({ id: "e1", pid: "p1" }),
        }),
      401,
    ],
    [
      "share POST",
      async () => (await import("@/lib/server/handlers/share")).POST(apiRequest("POST", "/api/events/e1/share", signedOut), id),
      401,
    ],
    [
      "share DELETE",
      async () => (await import("@/lib/server/handlers/share")).DELETE(apiRequest("DELETE", "/api/events/e1/share", signedOut), id),
      401,
    ],
    [
      "calendar GET",
      async () => (await import("@/lib/server/handlers/calendar")).GET(apiRequest("GET", "/api/events/e1/calendar.ics", signedOut), id),
      401,
    ],
    [
      "ai instruct POST",
      async () => (await import("@/lib/server/handlers/ai/instruct")).POST(apiRequest("POST", "/api/events/e1/ai/instruct", signedOut), id),
      401,
    ],
    [
      "ai ideas POST",
      async () => (await import("@/lib/server/handlers/ai/ideas")).POST(apiRequest("POST", "/api/events/e1/ai/ideas", signedOut), id),
      401,
    ],
    [
      "ai whatif POST",
      async () => (await import("@/lib/server/handlers/ai/whatif")).POST(apiRequest("POST", "/api/events/e1/ai/whatif", signedOut), id),
      401,
    ],
    [
      "ai enquiry POST",
      async () => (await import("@/lib/server/handlers/ai/enquiry")).POST(apiRequest("POST", "/api/events/e1/ai/enquiry", signedOut), id),
      401,
    ],
    [
      "demo instruct POST",
      async () =>
        (await import("@/lib/server/handlers/demo/instruct")).POST(apiRequest("POST", "/api/demo/office/ai/instruct", signedOut), sample),
      404,
    ],
    [
      "demo ideas POST",
      async () =>
        (await import("@/lib/server/handlers/demo/ideas")).POST(apiRequest("POST", "/api/demo/office/ai/ideas", signedOut), sample),
      404,
    ],
    [
      "demo AI status GET",
      async () => (await import("@/lib/server/handlers/demo/status")).GET(apiRequest("GET", "/api/demo/office/ai", signedOut), sample),
      404,
    ],
    ["health GET", async () => (await import("@/lib/server/handlers/health")).GET(), 200],
  ])("%s answers through the runtime deps", async (_, call, status) => {
    expect((await call()).status).toBe(status);
  });
});
