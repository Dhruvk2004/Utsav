import type { Db } from "../db/types";
import type { ServerDeps } from "../deps";
import { errorResponse, forbiddenOrigin, isSameOrigin, rateLimited } from "../http";
import { clearedSessionCookieHeader, readCookie, secureCookies, SESSION_COOKIE } from "./cookies";
import type { Session, SessionKind } from "./session";

/**
 * The authorisation step at the top of every signed-in route handler (spec 9.1): Firebase must be
 * configured, mutations must come from the app's own origin, the session cookie must verify (with
 * the revocation check for writes) and writes are rate limited per user.
 */

export type Authorized = { ok: true; session: Session; db: Db } | { ok: false; response: Response };

export const notConfigured = () => errorResponse(503, "not_configured", "Sign-in isn't configured on this deployment.");

export function sessionCookieOf(request: Request): string | null {
  return readCookie(request.headers.get("cookie"), SESSION_COOKIE);
}

export async function authorize(request: Request, deps: ServerDeps, kind: SessionKind): Promise<Authorized> {
  if (!deps.db || !deps.sessions) return { ok: false, response: notConfigured() };
  if (kind === "write" && !isSameOrigin(request, deps.appOrigin)) return { ok: false, response: forbiddenOrigin() };
  const cookie = sessionCookieOf(request);
  const session = await deps.sessions.verify(cookie, kind);
  if (!session) {
    // A cookie that no longer verifies (expired or revoked) is cleared, so the browser stops sending it.
    const headers = cookie ? { "Set-Cookie": clearedSessionCookieHeader(secureCookies(deps.appOrigin)) } : undefined;
    return { ok: false, response: errorResponse(401, "unauthenticated", "Please sign in again.", {}, headers) };
  }
  if (kind === "write") {
    const limit = deps.limits.mutation.check(session.uid);
    if (!limit.allowed)
      return {
        ok: false,
        response: rateLimited(limit.retryAfterSeconds, "Too many changes in a short time. Wait a moment and try again."),
      };
  }
  return { ok: true, session, db: deps.db };
}
