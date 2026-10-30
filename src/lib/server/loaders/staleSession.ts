import type { ServerDeps } from "../deps";

/**
 * Whether a session cookie the request carries no longer verifies: expired, malformed, signed by
 * another project, or sent to a deployment without Firebase. The proxy asks on the landing and
 * sign-in pages, which it would otherwise skip or trust from cookie presence alone, and clears such
 * a cookie, so a stale one cannot keep bouncing the visitor from `/` to `/dashboard` to `/signin`.
 * The check is local (signature and expiry with cached keys, no network call); a failure to check
 * keeps the cookie and the old behaviour.
 *
 * `cookie` is the decoded value of a cookie the request is known to carry (null when it does not decode).
 */
export async function sessionCookieStale(cookie: string | null, deps: ServerDeps): Promise<boolean> {
  if (!cookie || !deps.sessions) return true;
  try {
    return (await deps.sessions.verify(cookie, "read")) === null;
  } catch {
    return false;
  }
}
