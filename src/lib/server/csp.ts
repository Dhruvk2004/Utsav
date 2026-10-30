/**
 * Content Security Policy, split by route group (spec 9.1). Public pages (landing, `/demo`,
 * `/privacy`, 404 and the JSON API) get the narrow policy: same-origin only, no third party at all.
 * The sign-in, signed-in and share pages add what Google sign-in needs (its script, Identity
 * Toolkit, and the auth helper frame). Both are fixed headers from `next.config.ts`.
 *
 * Why not a per-request nonce with 'strict-dynamic': with Cache Components every route is
 * prerendered to a static shell at build time, and the shell's script tags can never carry a
 * request's nonce (Next.js documents nonces as incompatible with Partial Prerendering; in a
 * production build Chrome blocked the /signin shell's scripts under 'strict-dynamic'). These
 * pages render no user-supplied HTML (React escapes all text), so 'unsafe-inline' for Next's
 * bootstrap scripts is the accepted trade-off. This file has no imports, so `next.config.ts` can load it.
 */

export interface CspOptions {
  /** `next dev` needs `'unsafe-eval'` for React's debugging (never in production). */
  dev: boolean;
  /** `https://<project>.firebaseapp.com`, framed by Google sign-in; empty without Firebase. */
  firebaseHost: string;
}

/** Pages that sign in or render per user (the proxy matches the same prefixes). */
export const APP_PREFIXES = ["signin", "onboarding", "dashboard", "events", "settings", "s"] as const;

/** `next.config.ts` header sources: the app pages, and every other path except Firebase's proxied `/__/` helpers. */
export const APP_CSP_SOURCES = APP_PREFIXES.map((prefix) => `/${prefix}/:path*`).concat(["/signin", "/onboarding"]);
/**
 * Every path outside the app prefixes. A prefix is excluded only as a whole segment, so `/eventsx`
 * or `/signinfoo` (a 404) still gets the public policy (SEC-10).
 */
export const PUBLIC_CSP_SOURCE = "/:path((?!(?:signin|onboarding|dashboard|events|settings|s)(?:/|$)|__/).*)";

/**
 * Headers for Firebase's auth helper pages proxied at `/__/auth/*`. Next.js drops every routing
 * header (`next.config.ts` headers and proxy headers alike) from the response of an external rewrite
 * in `next.config.ts`, so `src/proxy.ts` makes the rewrite itself and sets these on it (SEC-02):
 * only this app may frame the helper, and no MIME sniffing.
 */
export const AUTH_HELPER_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Content-Security-Policy", "frame-ancestors 'self'; object-src 'none'; base-uri 'self'"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
];

const join = (directives: string[]) => directives.join("; ");

function base(dev: boolean, scripts: string): string[] {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${scripts}`,
    // 'unsafe-inline' is for Next's bootstrap <script> tags only; no page uses on* attributes (SEC-16).
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
}

/** Public pages load nothing from another origin; the demo's AI calls are same-origin. */
export function publicCsp({ dev }: Pick<CspOptions, "dev">): string {
  return join([...base(dev, ""), "img-src 'self' data:", "connect-src 'self'", "frame-src 'none'"]);
}

/** Sign-in and signed-in pages: Google sign-in's script, token endpoints, auth frame and avatars. */
export function appCsp({ dev, firebaseHost }: CspOptions): string {
  return join([
    ...base(dev, " https://apis.google.com"),
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://apis.google.com",
    `frame-src 'self' https://accounts.google.com${firebaseHost ? ` ${firebaseHost}` : ""}`,
  ]);
}

export const firebaseHostOf = (projectId: string | undefined): string =>
  projectId?.trim() ? `https://${projectId.trim()}.firebaseapp.com` : "";

/**
 * Where Firebase's auth helper is proxied from (spec 9.1: redirect sign-in from the app's own
 * origin): `/__/auth/*` and `/__/firebase/init.json` on `<project>.firebaseapp.com`, a fixed host.
 * Null for any other path, or when there is no Firebase project.
 */
export function firebaseHelperUrl(pathname: string, search: string, firebaseHost: string): string | null {
  if (!firebaseHost || !(pathname.startsWith("/__/auth/") || pathname === "/__/firebase/init.json")) return null;
  return `${firebaseHost}${pathname}${search}`;
}
