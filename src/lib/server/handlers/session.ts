import { z } from "zod";
import { clearedSessionCookieHeader, secureCookies, SESSION_TTL_MS, sessionCookieHeader } from "../auth/cookies";
import { notConfigured, sessionCookieOf } from "../auth/guard";
import type { SessionClaims } from "../auth/session";
import type { ServerDeps } from "../deps";
import { errorResponse, forbiddenOrigin, isSameOrigin, json, noContent, rateLimited, readJson } from "../http";
import { clientIp } from "../rateLimit";
import { UserRepo, type Identity } from "../repos/users";
import { runtime } from "../runtime";

/**
 * `POST /api/session` exchanges a fresh Google sign-in (Firebase ID token) for the httpOnly session
 * cookie and creates the user's profile on first sign-in; `DELETE` signs out (spec 9.1, 12.1).
 */

const bodySchema = z.strictObject({ idToken: z.string().min(1).max(4096) });

/** Only a sign-in from the last five minutes may mint a session cookie (Firebase's guidance). */
export const RECENT_SIGN_IN_S = 5 * 60;

function identityOf(claims: SessionClaims): Identity {
  return { displayName: claims.name ?? "", photoURL: claims.picture ?? null, email: claims.email ?? "" };
}

export async function createSession(request: Request, deps: ServerDeps): Promise<Response> {
  const { auth, db } = deps;
  if (!auth || !db) return notConfigured();
  if (!isSameOrigin(request, deps.appOrigin)) return forbiddenOrigin();
  const limit = deps.limits.session.check(clientIp(request.headers));
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds, "Too many sign-in attempts. Try again in a minute.");
  const body = await readJson(request, bodySchema);
  if (!body.ok) return body.response;

  let claims: SessionClaims;
  try {
    claims = await auth.verifyIdToken(body.data.idToken);
  } catch {
    return errorResponse(401, "invalid_token", "Sign-in didn't complete. Try again.");
  }
  const clock = deps.clock();
  if (Date.parse(clock.now) / 1000 - claims.auth_time > RECENT_SIGN_IN_S) {
    return errorResponse(401, "stale_sign_in", "Sign-in took too long. Try again.");
  }
  const cookie = await auth.createSessionCookie(body.data.idToken, { expiresIn: SESSION_TTL_MS });
  const user = await new UserRepo(db).ensure(claims.uid, identityOf(claims), clock.today, clock.now);
  deps.log("session_created", { uid: claims.uid });
  return json(
    { onboarded: user.onboardedAt !== null },
    { headers: { "Set-Cookie": sessionCookieHeader(cookie, secureCookies(deps.appOrigin)) } },
  );
}

/** Signs out: revokes the user's refresh tokens (every device) and clears the cookie. */
export async function deleteSession(request: Request, deps: ServerDeps): Promise<Response> {
  if (!isSameOrigin(request, deps.appOrigin)) return forbiddenOrigin();
  const session = await deps.sessions?.verify(sessionCookieOf(request), "read");
  if (session && deps.auth) {
    await deps.auth.revokeRefreshTokens(session.uid);
    deps.sessions?.forget(session.uid);
  }
  return noContent({ "Set-Cookie": clearedSessionCookieHeader(secureCookies(deps.appOrigin)) });
}

export const POST = (request: Request) => createSession(request, runtime());
export const DELETE = (request: Request) => deleteSession(request, runtime());
