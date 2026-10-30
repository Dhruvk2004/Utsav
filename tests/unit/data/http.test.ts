// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Api, ApiRequestError } from "@/lib/data/api";
import { FirebaseAuthClient, REDIRECT_FLAG, signInFailure, type GoogleSignIn } from "@/lib/data/firebaseAuthClient";
import { HttpEventsRepository, HttpProfileStore } from "@/lib/data/httpStores";
import { conflictEvent, HttpPlanApi, rejectedResults } from "@/lib/data/planApi";
import { createHttpServices } from "@/lib/data/services";
import { createEventSchema } from "@/lib/domain/model/createEvent";
import { UserRepo } from "@/lib/server/repos/users";
import { inProcessFetch } from "../../helpers/inProcessFetch";
import { createRequest, NOW_S, testDeps } from "../../helpers/server";

vi.mock("@/lib/firebase/client", () => ({ loadGoogleSignIn: vi.fn(async () => ({ popup: async () => "id" })) }));

afterEach(() => vi.unstubAllEnvs());

describe("Api", () => {
  const reply = (status: number, body?: unknown) => async () => new Response(body === undefined ? null : JSON.stringify(body), { status });

  it("sends JSON and validates the response", async () => {
    const fetcher = vi.fn(reply(200, { ok: 1 }));
    expect(await new Api(fetcher).request("/api/x", z.object({ ok: z.number() }), { method: "POST", body: { a: 1 } })).toEqual({ ok: 1 });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: '{"a":1}',
      }),
    );
    expect(await new Api(reply(204)).request("/api/x", z.undefined(), { method: "DELETE" })).toBeUndefined();
  });

  it("turns error bodies into ApiRequestError with the server's code, message and extras", async () => {
    const error = await new Api(reply(409, { error: { code: "version_conflict", message: "Changed." }, event: 1 }))
      .request("/api/x", z.unknown())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 409, code: "version_conflict", message: "Changed.", body: { event: 1 } });
    const plain = await new Api(async () => new Response("oops", { status: 500 })).request("/api/x", z.unknown()).catch((e: unknown) => e);
    expect(plain).toMatchObject({ status: 500, code: "http_error", message: "Something went wrong. Try again." });
  });

  it("uses the browser's fetch by default, and rethrows errors other than a 404 when loading an event", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: "boom", message: "Down." } }), { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(new HttpPlanApi("e1").get()).rejects.toMatchObject({ status: 500, code: "boom" });
    expect(fetcher).toHaveBeenCalledWith("/api/events/e1", expect.objectContaining({ method: "GET" }));
    vi.unstubAllGlobals();
  });

  it("reads conflict events and per-op results defensively", () => {
    expect(conflictEvent({ event: { version: 1 } })).toBeNull();
    expect(rejectedResults({ results: [{ ok: true }, { ok: false, reason: "No." }] })).toEqual([
      { ok: true },
      { ok: false, reason: "No." },
    ]);
    expect(rejectedResults({})).toBeNull();
  });
});

describe("HttpProfileStore and HttpEventsRepository", () => {
  it("load and save the profile, and list and create events, through the real handlers", async () => {
    const deps = testDeps();
    const api = new Api(inProcessFetch(deps));
    const profiles = new HttpProfileStore(api);
    // Sign-in (POST /api/session) creates the profile; GET only reads it (SEC-03).
    await expect(profiles.load()).rejects.toMatchObject({ status: 401 });
    await new UserRepo(deps.db).ensure(
      "u1",
      { displayName: "User u1", photoURL: null, email: "" },
      "2026-10-28",
      "2026-10-28T06:00:00.000Z",
    );
    expect((await profiles.load()).displayName).toBe("User u1");
    expect((await profiles.save({ homeCity: "Pune" })).homeCity).toBe("Pune");

    const events = new HttpEventsRepository(api);
    const created = await events.create(createEventSchema.parse(createRequest({ mode: "blank" })));
    expect(created.source).toBe("blank");
    expect((await events.list()).map((event) => event.id)).toEqual([created.eventId]);
  });
});

describe("FirebaseAuthClient", () => {
  function setup(google: Partial<GoogleSignIn> = {}) {
    const deps = testDeps();
    const sdk: GoogleSignIn = {
      popup: async () => `id:u1:${NOW_S}`,
      redirect: vi.fn(async () => undefined),
      redirectResult: async () => `id:u1:${NOW_S}`,
      signOut: vi.fn(async () => undefined),
      ...google,
    };
    const load = vi.fn(async () => sdk);
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const fetcher = inProcessFetch(deps, null);
    return { deps, sdk, load, store, client: new FirebaseAuthClient(load, storage, new Api(fetcher)), fetcher };
  }

  it("signs in with the popup, exchanges the token for the cookie and signs the SDK out", async () => {
    const { client, sdk, load, fetcher } = setup();
    client.preload();
    expect(await client.signIn()).toEqual({ ok: true, onboarded: false });
    expect(sdk.signOut).toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
    expect(fetcher.calls).toEqual(["POST /api/session"]);
  });

  it("maps Firebase errors to the UI's failure reasons", async () => {
    const blocked = setup({ popup: () => Promise.reject(Object.assign(new Error("x"), { code: "auth/popup-blocked" })) });
    expect(await blocked.client.signIn()).toEqual({ ok: false, reason: "popup_blocked" });
    expect(signInFailure({ code: "auth/popup-closed-by-user" })).toBe("cancelled");
    expect(signInFailure({ code: "auth/network-request-failed" })).toBe("network");
    expect(signInFailure("boom")).toBe("network");
  });

  it("retries loading the SDK after a failed load", async () => {
    const { client, load } = setup();
    load.mockRejectedValueOnce(new Error("offline"));
    client.preload();
    await Promise.resolve();
    expect(await client.signIn()).toMatchObject({ ok: true });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("continues in this tab and finishes the redirect sign-in on the next page load", async () => {
    const { client, sdk, store } = setup();
    expect(await client.completeRedirect()).toBeNull();
    await client.signInWithRedirect();
    expect(sdk.redirect).toHaveBeenCalled();
    expect(store.get(REDIRECT_FLAG)).toBe("1");
    expect(await client.completeRedirect()).toEqual({ ok: true, onboarded: false });
    expect(store.has(REDIRECT_FLAG)).toBe(false);
  });

  it("reports no result or a failure for an unfinished redirect", async () => {
    const empty = setup({ redirectResult: async () => null });
    empty.store.set(REDIRECT_FLAG, "1");
    expect(await empty.client.completeRedirect()).toBeNull();
    const failed = setup({ redirectResult: () => Promise.reject(Object.assign(new Error("x"), { code: "auth/user-cancelled" })) });
    failed.store.set(REDIRECT_FLAG, "1");
    expect(await failed.client.completeRedirect()).toEqual({ ok: false, reason: "cancelled" });
  });

  it("signs out through DELETE /api/session", async () => {
    const { client, fetcher } = setup();
    await client.signOut();
    expect(fetcher.calls).toEqual(["DELETE /api/session"]);
  });
});

describe("createHttpServices", () => {
  const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

  it("wires the HTTP stores and loads the Firebase SDK only when configured", async () => {
    const services = createHttpServices(storage);
    expect(services.profiles).toBeInstanceOf(HttpProfileStore);
    expect(services.events).toBeInstanceOf(HttpEventsRepository);
    expect(await services.auth.signIn()).toEqual({ ok: false, reason: "network" });

    for (const [key, value] of Object.entries({
      NEXT_PUBLIC_FIREBASE_API_KEY: "k",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "utsav.test",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "p",
      NEXT_PUBLIC_FIREBASE_APP_ID: "a",
    }))
      vi.stubEnv(key, value);
    const { loadGoogleSignIn } = await import("@/lib/firebase/client");
    createHttpServices(storage).auth.preload();
    expect(loadGoogleSignIn).toHaveBeenCalledWith({ apiKey: "k", authDomain: "utsav.test", projectId: "p", appId: "a" });
  });
});
