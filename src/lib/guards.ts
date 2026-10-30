import { HOME_PATH, safeNextPath } from "./client/navigation";

/**
 * Route guards (spec 3.3) as one table. The server layouts apply it with a verified session; the
 * proxy applies the signed-out column from cookie presence alone, as a cheap early redirect that
 * never trusts the cookie.
 */

/** Request header the proxy sets to the page's path and query, for the server guard's `?next=`. */
export const GUARD_PATH_HEADER = "x-utsav-path";

export type Viewer = "signed_out" | "not_onboarded" | "onboarded";
export type GuardedRoute = "landing" | "signin" | "onboarding" | "app";

const APP_PREFIXES = ["/dashboard", "/events", "/settings"];

/** Which guard row a path falls under; public pages (`/demo`, `/s/…`, `/privacy`) have none. */
export function routeOf(pathname: string): GuardedRoute | null {
  if (pathname === "/") return "landing";
  if (pathname === "/signin") return "signin";
  if (pathname === "/onboarding") return "onboarding";
  return APP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ? "app" : null;
}

export interface GuardRequest {
  /** Path and query of the page asked for, e.g. "/events/abc/budget?ai=open". */
  path: string;
  search: URLSearchParams;
}

export const signInPath = (next: string) => `/signin?next=${encodeURIComponent(next)}`;

/** Where the viewer must go instead, or null when the page renders. */
export function guardRedirect(route: GuardedRoute, viewer: Viewer, request: GuardRequest): string | null {
  switch (route) {
    case "landing":
      return viewer === "signed_out" ? null : viewer === "onboarded" ? HOME_PATH : "/onboarding";
    case "signin":
      if (viewer === "signed_out") return null;
      return viewer === "onboarded" ? safeNextPath(request.search.get("next")) : "/onboarding";
    case "onboarding":
      if (viewer === "signed_out") return signInPath(request.path);
      return viewer === "onboarded" && request.search.get("rerun") !== "1" ? HOME_PATH : null;
    case "app":
      if (viewer === "signed_out") return signInPath(request.path);
      return viewer === "not_onboarded" ? "/onboarding" : null;
  }
}

/**
 * The proxy's cookie-presence redirect: signed-out visitors to private pages go to sign-in, and
 * a visitor with a session cookie skips the landing page (the proxy first clears a cookie that no
 * longer verifies, see `sessionCookieStale`). Everything else is left to the server
 * guard, which verifies the cookie.
 */
export function proxyRedirect(pathname: string, search: URLSearchParams, hasSessionCookie: boolean): string | null {
  const route = routeOf(pathname);
  if (!route) return null;
  const query = search.toString();
  const request = { path: query ? `${pathname}?${query}` : pathname, search };
  if (!hasSessionCookie) return route === "app" || route === "onboarding" ? guardRedirect(route, "signed_out", request) : null;
  return route === "landing" ? HOME_PATH : null;
}
