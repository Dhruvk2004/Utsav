// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryDb } from "../../helpers/memoryDb";
import { FakeAuth } from "../../helpers/server";

const admin = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/lib/server/firebase/admin", () => ({
  adminServices: (projectId: string) => {
    admin.calls.push(projectId);
    return { auth: new FakeAuth(), db: new MemoryDb() };
  },
}));

const { createServerDeps, jsonLogger, runtime } = await import("@/lib/server/runtime");

afterEach(() => {
  admin.calls.length = 0;
  vi.restoreAllMocks();
});

describe("createServerDeps", () => {
  it("works with nothing configured: no database, no auth, no model", () => {
    const deps = createServerDeps({});
    expect(deps).toMatchObject({ db: null, auth: null, sessions: null, model: null, appOrigin: null, probe: { location: "none" } });
    expect(admin.calls).toEqual([]);
    expect(deps.clock().today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(deps.randomBytes(32)).toHaveLength(32);
  });

  it("initialises Firebase Admin for the configured project and reads APP_ORIGIN", () => {
    const deps = createServerDeps({ GOOGLE_CLOUD_PROJECT: "utsav-prod", APP_ORIGIN: "https://utsav.app/" });
    expect(admin.calls).toEqual(["utsav-prod"]);
    expect(deps.db).not.toBeNull();
    expect(deps.sessions).not.toBeNull();
    expect(deps.appOrigin).toBe("https://utsav.app");
  });

  it("is built once per server instance", () => {
    expect(runtime()).toBe(runtime());
  });

  it("shares caches and limits with a second copy of the module, as Next's page and route bundles are (QA-04 regression)", async () => {
    const pageBundle = runtime();
    vi.resetModules();
    const routeBundle = (await import("@/lib/server/runtime")).runtime();
    expect(routeBundle).not.toBe(pageBundle);
    pageBundle.caches.shares.set("hash-1", { title: "cached" } as never);
    routeBundle.caches.shares.delete("hash-1");
    expect(pageBundle.caches.shares.get("hash-1")).toBeUndefined();
    expect(routeBundle.limits).toBe(pageBundle.limits);
  });
});

describe("jsonLogger", () => {
  it("writes one JSON line with the uid hashed, never the uid itself", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    jsonLogger("plan_generated", { uid: "user-123", latencyMs: 5 });
    jsonLogger("health");
    const line = JSON.parse(log.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(line).toMatchObject({
      severity: "INFO",
      message: "plan_generated",
      latencyMs: 5,
      uidHash: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(log.mock.calls[0][0]).not.toContain("user-123");
    expect(JSON.parse(log.mock.calls[1][0] as string)).toEqual({ severity: "INFO", message: "health" });
  });
});
