import { createHash, randomBytes } from "node:crypto";
import { createGeminiModel, createModelProbe } from "@/lib/ai/model";
import { appOrigin, assertDeployableEnv, firebaseProjectId } from "@/lib/config";
import { todayInIndia } from "@/lib/domain/dates";
import { SessionVerifier } from "./auth/session";
import { demoQuotaFor } from "./demoQuota";
import { createCaches, createLimits, type Logger, type ServerDeps } from "./deps";
import { adminServices } from "./firebase/admin";

/**
 * The production `ServerDeps`, built from the environment once per server instance. With no
 * Firebase project configured, `db` and `auth` are null: signed-in routes answer 503 and every
 * public page keeps working (the "graceful without configuration" rule).
 */

type Env = Record<string, string | undefined>;

/** Structured JSON logs (spec 9.4): uids are hashed; prompts, notes and AI output are never logged. */
export const jsonLogger: Logger = (event, fields = {}) => {
  const { uid, ...rest } = fields;
  const uidHash = typeof uid === "string" ? createHash("sha256").update(uid).digest("hex").slice(0, 16) : undefined;
  console.log(JSON.stringify({ severity: "INFO", message: event, ...(uidHash ? { uidHash } : {}), ...rest }));
};

/** The per-process state every bundle must see the same copy of. */
type SharedState = Pick<ServerDeps, "caches" | "limits">;

export function createServerDeps(env: Env, shared: SharedState = { caches: createCaches(), limits: createLimits() }): ServerDeps {
  assertDeployableEnv(env);
  const projectId = firebaseProjectId(env);
  const firebase = projectId ? adminServices(projectId, env) : null;
  return {
    db: firebase?.db ?? null,
    auth: firebase?.auth ?? null,
    sessions: firebase ? new SessionVerifier(firebase.auth) : null,
    model: createGeminiModel(env),
    probe: createModelProbe(env),
    appOrigin: appOrigin(env),
    clock: () => {
      const now = new Date();
      return { today: todayInIndia(now), now: now.toISOString() };
    },
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
    limits: shared.limits,
    caches: shared.caches,
    demoQuota: demoQuotaFor(firebase?.db ?? null),
    log: jsonLogger,
  };
}

const SHARED_KEY = Symbol.for("utsav.server.shared");

/**
 * Caches and rate limits live on `globalThis`, not in this module: Next bundles route handlers and
 * pages separately, so each bundle gets its own copy of this module. Without one shared copy, a
 * share revoked through the route handler stayed in the page's projection cache for 60 s (QA-04),
 * and the page and API each counted their own rate limits.
 */
export function processSharedState(): SharedState {
  const holder = globalThis as typeof globalThis & { [SHARED_KEY]?: SharedState };
  holder[SHARED_KEY] ??= { caches: createCaches(), limits: createLimits() };
  return holder[SHARED_KEY];
}

let current: ServerDeps | undefined;

/** The shared deps for this server instance, created on first use. */
export function runtime(): ServerDeps {
  current ??= createServerDeps(process.env, processSharedState());
  return current;
}
