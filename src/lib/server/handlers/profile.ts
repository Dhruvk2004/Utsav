import { profilePatchSchema } from "@/lib/domain/model/user";
import { clearedSessionCookieHeader, secureCookies } from "../auth/cookies";
import { authorize } from "../auth/guard";
import type { Session } from "../auth/session";
import type { ServerDeps } from "../deps";
import { errorResponse, json, readJson } from "../http";
import { toProfile, UserRepo, type Identity } from "../repos/users";
import { runtime } from "../runtime";

/** `GET/PUT /api/profile` (spec 4, 12.1): the signed-in user's profile; PUT merges a partial patch. */

export const identityOf = (session: Session): Identity => ({ displayName: session.name, photoURL: session.picture, email: session.email });

/**
 * Reads only: the profile is created by `POST /api/session` at sign-in. Reads skip the revocation
 * check (spec 9.1), so creating it here would let an old cookie re-create a deleted account's
 * profile (SEC-03). A session without a profile counts as signed out.
 */
export async function getProfile(request: Request, deps: ServerDeps): Promise<Response> {
  const auth = await authorize(request, deps, "read");
  if (!auth.ok) return auth.response;
  const user = await new UserRepo(auth.db).get(auth.session.uid);
  if (!user)
    return errorResponse(
      401,
      "unauthenticated",
      "Please sign in again.",
      {},
      { "Set-Cookie": clearedSessionCookieHeader(secureCookies(deps.appOrigin)) },
    );
  return json({ profile: toProfile(user) });
}

export async function putProfile(request: Request, deps: ServerDeps): Promise<Response> {
  const auth = await authorize(request, deps, "write");
  if (!auth.ok) return auth.response;
  const body = await readJson(request, profilePatchSchema);
  if (!body.ok) return body.response;
  const user = await new UserRepo(auth.db).savePatch(auth.session.uid, identityOf(auth.session), body.data, deps.clock());
  return json({ profile: toProfile(user) });
}

export const GET = (request: Request) => getProfile(request, runtime());
export const PUT = (request: Request) => putProfile(request, runtime());
