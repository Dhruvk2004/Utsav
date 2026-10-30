import { io } from "next/cache";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { GUARD_PATH_HEADER, guardRedirect, type GuardedRoute, type Viewer } from "@/lib/guards";
import { SESSION_COOKIE } from "../auth/cookies";
import type { Session, SessionKind } from "../auth/session";
import type { ServerDeps } from "../deps";
import { UserRepo } from "../repos/users";
import { runtime } from "../runtime";

/**
 * The session as server components see it (spec 9.1): `getSession(kind)` is memoised per request,
 * and the route guards (spec 3.3) run in the layouts with a verified session, never trusting the
 * proxy's cookie-presence check.
 */

export async function sessionFor(cookie: string | null, kind: SessionKind, deps: ServerDeps): Promise<Session | null> {
  return deps.sessions ? deps.sessions.verify(cookie, kind) : null;
}

/**
 * Signed out, signed in but not onboarded, or onboarded (the guard table's three columns). Sign-in
 * creates the profile, so a session without one (an old cookie of a deleted account) is signed out (SEC-03).
 */
export async function viewerFor(session: Session | null, deps: ServerDeps): Promise<Viewer> {
  if (!session || !deps.db) return "signed_out";
  const user = await new UserRepo(deps.db).get(session.uid);
  if (!user) return "signed_out";
  return user.onboardedAt ? "onboarded" : "not_onboarded";
}

export const getSession = cache(async (kind: SessionKind): Promise<Session | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  // Verifying reads the clock (firebase-admin checks expiry with Date.now()), which Cache Components
  // refuses while prerendering, even a runtime prefetch with cookies (QA-10). `io()` keeps it at request time.
  await io();
  return sessionFor(cookie, kind, runtime());
});

const currentViewer = cache(async (): Promise<Viewer> => viewerFor(await getSession("read"), runtime()));

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toSearch(params: Awaited<SearchParams>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const each of [value ?? []].flat()) search.append(key, each);
  }
  return search;
}

/** Where the guard sends this request, or null when the page renders. */
export async function guardTarget(route: GuardedRoute, searchParams?: SearchParams): Promise<string | null> {
  const [viewer, requestHeaders, params] = await Promise.all([currentViewer(), headers(), searchParams]);
  const search = toSearch(params ?? {});
  const path = requestHeaders.get(GUARD_PATH_HEADER) ?? (route === "app" ? "/dashboard" : `/${route}`);
  return guardRedirect(route, viewer, { path, search });
}
