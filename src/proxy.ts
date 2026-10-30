import { NextResponse, type NextRequest } from "next/server";
import { isShareToken } from "@/lib/client/shareView";
import { GUARD_PATH_HEADER, proxyRedirect, routeOf } from "@/lib/guards";
import { clearedSessionCookieHeader, secureCookies, SESSION_COOKIE } from "@/lib/server/auth/cookies";
import { sessionCookieOf } from "@/lib/server/auth/guard";
import { AUTH_HELPER_HEADERS, firebaseHelperUrl, firebaseHostOf } from "@/lib/server/csp";
import { eventPageId, eventPageMissing } from "@/lib/server/loaders/eventPage";
import { sessionCookieStale } from "@/lib/server/loaders/staleSession";
import { runtime } from "@/lib/server/runtime";

// The Firebase project behind Google sign-in (public web config, inlined at build time).
const FIREBASE_HOST = firebaseHostOf(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

/**
 * Next.js 16 proxy (formerly middleware, spec 3.3): a cheap cookie-presence redirect that never
 * trusts the cookie (server layouts verify it), a local check that clears a stale cookie on the
 * landing and sign-in pages (so it cannot lock a visitor out of `/`), the page path for the server guard's `?next=`,
 * a real 404 status for malformed share tokens and for someone else's event (QA-05) before any
 * page renders, and the security headers of Firebase's proxied auth helper (an external rewrite,
 * which `next.config.ts` headers miss).
 */
export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname.startsWith("/__/")) {
    // Firebase's auth helper, served from the app's own origin so redirect sign-in works where
    // third-party storage is blocked. Rewritten here, not in next.config.ts, so it keeps these headers (SEC-02).
    const helper = firebaseHelperUrl(pathname, request.nextUrl.search, FIREBASE_HOST);
    const response = helper ? NextResponse.rewrite(new URL(helper)) : NextResponse.next();
    for (const [key, value] of AUTH_HELPER_HEADERS) response.headers.set(key, value);
    return response;
  }
  if (pathname.startsWith("/s/") && !isShareToken(pathname.slice(3))) {
    return NextResponse.rewrite(new URL("/404", request.url));
  }
  let hasCookie = request.cookies.has(SESSION_COOKIE);
  // The landing page is skipped and sign-in trusted on cookie presence, so a stale cookie is checked and cleared there.
  const route = routeOf(pathname);
  const stale = hasCookie && (route === "landing" || route === "signin") && (await sessionCookieStale(sessionCookieOf(request), runtime()));
  if (stale) hasCookie = false;
  const target = proxyRedirect(pathname, searchParams, hasCookie);
  if (target) return NextResponse.redirect(new URL(target, request.url));
  // Only a signed-in load of a workspace page pays for the ownership check (one event read).
  if (eventPageId(pathname) !== null && hasCookie && (await eventPageMissing(request, runtime()))) {
    return NextResponse.rewrite(new URL("/404", request.url));
  }
  const headers = new Headers(request.headers);
  headers.set(GUARD_PATH_HEADER, `${pathname}${request.nextUrl.search}`);
  const response = NextResponse.next({ request: { headers } });
  if (stale) response.headers.append("Set-Cookie", clearedSessionCookieHeader(secureCookies(runtime().appOrigin)));
  return response;
}

export const config = {
  matcher: ["/", "/signin", "/onboarding", "/dashboard/:path*", "/events/:path*", "/settings/:path*", "/s/:path*", "/__/:path*"],
};
