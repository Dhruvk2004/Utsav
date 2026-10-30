import type { ModelProbe, PlanModel } from "@/lib/ai/model";
import type { CreateEventInput } from "@/lib/domain/model/createEvent";
import { SESSION_COOKIE } from "@/lib/server/auth/cookies";
import { SessionVerifier, type SessionAuth, type SessionClaims } from "@/lib/server/auth/session";
import { MemoryDemoQuota } from "@/lib/server/demoQuota";
import { createCaches, createLimits, type ServerDeps } from "@/lib/server/deps";
import { MemoryDb } from "./memoryDb";

/**
 * Route-handler test kit: an in-memory database, a fake Firebase Admin Auth, a fixed clock and
 * request builders. Tokens are readable strings: an ID token is `id:<uid>:<authTimeSeconds>`, the
 * session cookie minted from it is `session:<uid>:<authTimeSeconds>`.
 */

export const ORIGIN = "https://utsav.test";
export const TODAY = "2026-10-28";
export const NOW = "2026-10-28T06:00:00.000Z";
export const NOW_S = Date.parse(NOW) / 1000;

export class FakeAuth implements SessionAuth {
  /** `tokensValidAfterTime` per uid; a missing uid is an existing user never revoked. */
  readonly validAfter = new Map<string, string>();
  readonly deleted = new Set<string>();
  getUserCalls = 0;
  verifyCalls: boolean[] = [];

  private claims(token: string, prefix: string): SessionClaims {
    const [kind, uid, authTime] = token.split(":");
    if (kind !== prefix || !uid) throw new Error("invalid token");
    return {
      uid,
      auth_time: Number(authTime),
      email: `${uid}@example.com`,
      name: `User ${uid}`,
      picture: "https://lh3.googleusercontent.com/a",
    };
  }

  async verifyIdToken(idToken: string) {
    return this.claims(idToken, "id");
  }

  async createSessionCookie(idToken: string) {
    return idToken.replace(/^id:/, "session:");
  }

  async verifySessionCookie(cookie: string, checkRevoked: boolean) {
    this.verifyCalls.push(checkRevoked);
    return this.claims(cookie, "session");
  }

  async getUser(uid: string) {
    this.getUserCalls += 1;
    if (this.deleted.has(uid)) throw new Error("auth/user-not-found");
    return { tokensValidAfterTime: this.validAfter.get(uid) };
  }

  async revokeRefreshTokens(uid: string) {
    this.validAfter.set(uid, new Date((NOW_S + 1) * 1000).toUTCString());
  }

  async deleteUser(uid: string) {
    this.deleted.add(uid);
  }
}

export const fakeProbe = (reachable = true): ModelProbe => ({ id: "gemini-test", location: "global", reachable: async () => reachable });

export type TestDeps = ServerDeps & { db: MemoryDb; auth: FakeAuth; logs: string[] };

export function testDeps(overrides: { model?: PlanModel | null; probe?: ModelProbe; clockMs?: () => number } = {}): TestDeps {
  const db = new MemoryDb();
  const auth = new FakeAuth();
  const clockMs = overrides.clockMs ?? (() => Date.parse(NOW));
  const logs: string[] = [];
  let bytes = 0;
  return {
    db,
    auth,
    logs,
    sessions: new SessionVerifier(auth, clockMs),
    model: overrides.model ?? null,
    probe: overrides.probe ?? fakeProbe(),
    appOrigin: ORIGIN,
    clock: () => ({ today: TODAY, now: NOW }),
    randomBytes: (size) => new Uint8Array(size).fill((bytes += 1)),
    limits: createLimits(clockMs),
    caches: createCaches(clockMs),
    demoQuota: new MemoryDemoQuota(),
    log: (event) => void logs.push(event),
  };
}

/** The session cookie for `uid`, signed in at NOW. */
export const sessionCookie = (uid = "u1", authTime = NOW_S) => `${SESSION_COOKIE}=session:${uid}:${authTime}`;

export function apiRequest(
  method: string,
  path: string,
  {
    body,
    cookie = sessionCookie(),
    origin = ORIGIN,
    headers = {},
  }: { body?: unknown; cookie?: string | null; origin?: string | null; headers?: Record<string, string> } = {},
): Request {
  const all = new Headers(headers);
  if (cookie) all.set("cookie", cookie);
  if (origin) all.set("origin", origin);
  if (body !== undefined) all.set("content-type", "application/json");
  return new Request(`${ORIGIN}${path}`, { method, headers: all, body: body === undefined ? undefined : JSON.stringify(body) });
}

export const params = <T extends Record<string, string>>(value: T) => Promise.resolve(value);

export async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/** A valid wizard request (spec 5.1) for a December wedding with one typed function and a named honoree. */
export function createRequest(overrides: Partial<CreateEventInput> = {}): CreateEventInput {
  return {
    mode: "ai",
    eventType: "wedding",
    title: "Ananya & Rohan's wedding",
    occasion: null,
    occasionOther: "",
    milestone: null,
    eventDate: "2026-12-14",
    city: "Pune",
    guestCount: 350,
    budget: 2_500_000,
    functions: [
      { name: "Sangeet", date: "2026-12-13", startTime: "19:00", endTime: "23:00", sharePercent: 15 },
      { name: "Wedding", date: null, startTime: null, endTime: null, sharePercent: null },
    ],
    vibe: "Marigold and music",
    theme: "",
    tradition: ["marathi"],
    traditionOther: "",
    dietary: ["veg"],
    honorees: [{ role: "bride", name: "Ananya", age: 28, gender: null, interests: ["Kathak"], notes: "Allergic to lilies" }],
    flags: { kids: false, elderly: true, mobility: false },
    language: "en",
    ...overrides,
  };
}
