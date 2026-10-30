/**
 * The session cookie (spec 9.1): `__session` (the one cookie name Firebase Hosting and Cloud Run
 * proxies pass through), httpOnly, SameSite=Lax, Secure on https, five days.
 */

export const SESSION_COOKIE = "__session";
export const SESSION_TTL_MS = 5 * 24 * 60 * 60 * 1000;

/** Reads one cookie from a `Cookie` header. A value that is not valid percent-encoding counts as no cookie (SEC-05). */
export function readCookie(header: string | null, name: string): string | null {
  for (const part of header?.split(";") ?? []) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function sessionCookieHeader(value: string, secure: boolean, maxAgeMs = SESSION_TTL_MS): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearedSessionCookieHeader(secure: boolean): string {
  return sessionCookieHeader("", secure, 0);
}

/** Secure everywhere except a plain-http origin (local development). */
export function secureCookies(appOrigin: string | null): boolean {
  return !appOrigin?.startsWith("http://");
}
