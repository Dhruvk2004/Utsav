import { afterEach, describe, expect, it, vi } from "vitest";

import { detailsFromRequest } from "@/lib/domain/model/createEvent";

import { isAbortError, wait } from "@/lib/data/wait";
import { createEventSchema } from "@/lib/domain/model/createEvent";
import { eventDocSchema } from "@/lib/domain/model/event";
import { userDocSchema } from "@/lib/domain/model/user";
import {
  InMemoryEventsRepository,
  InMemoryProfileStore,
  STUB_PROFILE,
  StubAuthClient,
  createStubServices,
  stubEventSummaries,
} from "../../helpers/stubServices";

const request = createEventSchema.parse({
  mode: "ai",
  eventType: "community",
  title: "",
  occasion: "diwali",
  occasionOther: "",
  milestone: null,
  eventDate: "2026-11-06",
  city: "Chennai",
  guestCount: 200,
  budget: 150_000,
  functions: [],
  vibe: "",
  theme: "",
  tradition: ["tamil"],
  traditionOther: "",
  dietary: ["veg"],
  honorees: [],
  flags: { kids: true, elderly: false, mobility: false },
  language: "en",
});

afterEach(() => vi.useRealTimers());

describe("wait", () => {
  it("resolves after the delay", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    void wait(100).then(done);
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toHaveBeenCalled();
  });

  it("rejects with an AbortError when aborted before or during the wait", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(wait(10, controller.signal)).rejects.toSatisfy(isAbortError);
    const later = new AbortController();
    const pending = wait(1_000, later.signal);
    later.abort();
    await expect(pending).rejects.toSatisfy(isAbortError);
    expect(isAbortError(new Error("x"))).toBe(false);
  });
});

describe("InMemoryProfileStore", () => {
  it("loads and saves with the shared merge rule", async () => {
    const store = new InMemoryProfileStore(STUB_PROFILE, () => "2026-10-28T06:00:00.000Z");
    expect(await store.load()).toBe(STUB_PROFILE);
    const saved = await store.save({ homeCity: "Pune", markOnboarded: true });
    expect(saved).toMatchObject({ homeCity: "Pune", onboardedAt: "2026-10-28T06:00:00.000Z" });
    expect(await store.load()).toBe(saved);
  });

  it("stamps the current time by default", async () => {
    const saved = await new InMemoryProfileStore(STUB_PROFILE).save({ markOnboarded: true });
    expect(Date.parse(saved.onboardedAt ?? "")).not.toBeNaN();
  });
});

describe("InMemoryEventsRepository", () => {
  it("lists the seed plus created events, and creates from the request", async () => {
    const repo = new InMemoryEventsRepository(() => stubEventSummaries("2026-10-28"));
    expect(await repo.create(request)).toEqual({ eventId: "new-event-1", source: "ai" });
    expect(await repo.create({ ...request, mode: "blank" })).toEqual({ eventId: "new-event-2", source: "blank" });
    const all = await repo.list();
    expect(all).toHaveLength(6);
    expect(all[4]).toMatchObject({ guests: 200, budgetTotal: 150_000, details: detailsFromRequest(request) });
  });

  it("honours cancellation", async () => {
    const repo = new InMemoryEventsRepository(() => [], 1_000);
    const controller = new AbortController();
    const pending = repo.list(controller.signal);
    controller.abort();
    await expect(pending).rejects.toSatisfy(isAbortError);
  });

  it("stores details that satisfy the event schema", () => {
    expect(eventDocSchema.shape.details.safeParse(detailsFromRequest(request)).success).toBe(true);
  });
});

describe("StubAuthClient", () => {
  it("signs in as the stub profile and reports onboarding", async () => {
    const profiles = new InMemoryProfileStore(STUB_PROFILE);
    const auth = new StubAuthClient(profiles);
    expect(await auth.signIn()).toEqual({ ok: true, onboarded: false });
    await profiles.save({ markOnboarded: true });
    expect(await auth.signIn()).toEqual({ ok: true, onboarded: true });
    await expect(auth.signInWithRedirect()).resolves.toBeUndefined();
    await expect(auth.signOut()).resolves.toBeUndefined();
  });
});

describe("stubs", () => {
  it("keeps the stub profile in the stored shape", () => {
    expect(
      userDocSchema.safeParse({ ...STUB_PROFILE, createdAt: "2026-10-28T06:00:00.000Z", updatedAt: "2026-10-28T06:00:00.000Z" }).success,
    ).toBe(true);
  });

  it("wires one profile store into the auth client", async () => {
    const services = createStubServices(0);
    await services.profiles.save({ markOnboarded: true });
    expect(await services.auth.signIn()).toEqual({ ok: true, onboarded: true });
    expect((await services.events.list()).length).toBe(4);
  });
});
