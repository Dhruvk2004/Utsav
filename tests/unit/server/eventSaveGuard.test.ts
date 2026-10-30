// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { getEvent } from "@/lib/server/handlers/event";
import { createEvent } from "@/lib/server/handlers/events";
import { makeDraft } from "../../fixtures";
import { apiRequest, bodyOf, createRequest, params, testDeps } from "../../helpers/server";

vi.mock("@/lib/plan/newEvent", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/plan/newEvent")>();
  return {
    ...actual,
    planToEventDoc: (...args: Parameters<typeof actual.planToEventDoc>) => ({
      ...actual.planToEventDoc(...args),
      tasks: [{ id: "x".repeat(81) }],
    }),
  };
});

describe("saving an AI plan", () => {
  it("falls back to the template rather than save an event nobody could open (real Gemini regression)", async () => {
    const deps = testDeps({ model: { name: "fake", generateJson: async () => JSON.stringify(makeDraft()), callTools: async () => [] } });
    const response = await createEvent(apiRequest("POST", "/api/events", { body: createRequest() }), deps);
    expect(response.status).toBe(201);
    const { eventId, source } = (await bodyOf(response)) as { eventId: string; source: string };
    expect(source).toBe("template");
    expect(deps.logs).toContain("plan_rejected_on_save");
    const opened = await getEvent(apiRequest("GET", `/api/events/${eventId}`), deps, params({ id: eventId }));
    expect(opened.status).toBe(200);
  });
});
