/**
 * Deployment configuration in one place. Every reader is a pure function of an env object, so the
 * app can build, start and serve its public pages with nothing configured: callers get `null` and
 * show a "not configured" state instead of crashing. AI settings live with the model in
 * `src/lib/ai/model.ts`.
 */

type Env = Record<string, string | undefined>;

/** Firebase web config. Public by design; `authDomain` is the app host (spec 9.1). */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

/**
 * The `NEXT_PUBLIC_*` values. Each is referenced literally so Next.js can inline it into the client
 * bundle at build time (they arrive as Docker build args).
 */
export function publicEnv(): Env {
  return {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function value(env: Env, key: string): string | null {
  const raw = env[key]?.trim();
  return raw ? raw : null;
}

/** The web config when all four values are set, otherwise null (sign-in is then unavailable). */
export function firebaseWebConfig(env: Env): FirebaseWebConfig | null {
  const apiKey = value(env, "NEXT_PUBLIC_FIREBASE_API_KEY");
  const authDomain = value(env, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  const projectId = value(env, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const appId = value(env, "NEXT_PUBLIC_FIREBASE_APP_ID");
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
}

/** True when the client can offer Google sign-in. */
export function isSignInConfigured(env: Env = publicEnv()): boolean {
  return firebaseWebConfig(env) !== null;
}

/** Server-side Firebase project: FIREBASE_PROJECT_ID, then GOOGLE_CLOUD_PROJECT, then the web config's id. */
export function firebaseProjectId(env: Env): string | null {
  return value(env, "FIREBASE_PROJECT_ID") ?? value(env, "GOOGLE_CLOUD_PROJECT") ?? value(env, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");
}

/** Local emulator hosts, honoured by the Admin SDK when set. */
export function firebaseEmulators(env: Env): { firestore: string | null; auth: string | null } {
  return { firestore: value(env, "FIRESTORE_EMULATOR_HOST"), auth: value(env, "FIREBASE_AUTH_EMULATOR_HOST") };
}

/**
 * Settings that point the server at a local test double. They are for the emulator suites only: with
 * an emulator host, firebase-admin accepts unsigned tokens and cookies for any uid, and a Gemini base
 * URL sends the API key to that host.
 */
export const TEST_ONLY_ENV = [
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "GOOGLE_GEMINI_BASE_URL",
  "GOOGLE_VERTEX_BASE_URL",
] as const;

/**
 * Refuses a deployed server (Cloud Run sets K_SERVICE, Vercel sets VERCEL) that carries any
 * test-only setting (SEC-09).
 * Called when the server starts (`src/instrumentation.ts`) and when the server deps are built.
 */
export function assertDeployableEnv(env: Env): void {
  if (!value(env, "K_SERVICE") && !value(env, "VERCEL")) return;
  const found = TEST_ONLY_ENV.filter((name) => value(env, name));
  if (found.length > 0) throw new Error(`Refusing to start a deployed server with test-only settings: ${found.join(", ")}`);
}

/** The public origin (scheme + host + port) used for CSRF origin checks and share links, or null if unset or invalid. */
export function appOrigin(env: Env): string | null {
  const raw = value(env, "APP_ORIGIN");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}
