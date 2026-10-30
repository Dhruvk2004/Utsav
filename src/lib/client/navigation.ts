/** Where signed-in users land by default (spec 3.3). */
export const HOME_PATH = "/dashboard";

/** A path a browser would read as protocol-relative (`//host` or `/\host`), i.e. another site. */
const leavesSite = (path: string) => path.startsWith("//") || path.startsWith("/\\");

/**
 * The `?next=` return path after sign-in, accepted only as a same-origin path (spec 3.1). Anything
 * that could leave the site (`//host`, `/\host`, a scheme) falls back to `fallback`.
 */
export function safeNextPath(next: string | null | undefined, fallback = HOME_PATH): string {
  if (!next || !next.startsWith("/") || leavesSite(next)) return fallback;
  // Browsers strip tabs and newlines before parsing, so "/\t/evil.example" is checked as a URL too.
  // A value the URL parser refuses (e.g. "/\t/", which strips to an empty-host "//") is not a
  // path a browser could follow either, so it falls back instead of throwing (SEC-17).
  let url: URL;
  try {
    url = new URL(next, "https://utsav.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "https://utsav.invalid") return fallback;
  // The returned path is the normalised one, so check it again: dot segments ("/.//host",
  // "/a/../\\/host") collapse into a protocol-relative URL only after normalising (SEC-01).
  const path = `${url.pathname}${url.search}${url.hash}`;
  return leavesSite(path) ? fallback : path;
}

/** Where a successful sign-in goes: onboarding first, then the requested page (spec 3.3). */
export function afterSignInPath(onboarded: boolean, next: string | null | undefined): string {
  return onboarded ? safeNextPath(next) : "/onboarding";
}

export const eventHref = (eventId: string) => `/events/${encodeURIComponent(eventId)}`;
