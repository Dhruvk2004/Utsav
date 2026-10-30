import { sessionCookieOf } from "../auth/guard";
import type { ServerDeps } from "../deps";
import { EventRepo } from "../repos/events";

/**
 * The HTTP status of a full page load of someone else's event (spec 3.3, QA-05). The workspace
 * streams under Cache Components and loads the event in the browser, so by the time anything
 * knows the event is missing the page has already been sent with 200. The proxy runs before the
 * page renders, so it asks here and answers 404 instead.
 *
 * Only document loads are checked: a client navigation between tabs (an RSC request) has no
 * status anyone sees, and checking it would add a Firestore read to every tab switch. Each hard
 * load costs one event read and a local cookie check (no network call). Anything uncertain
 * (signed out, no Firebase, an error) lets the page through, and it shows its own not-found UI.
 */

const EVENT_PAGE = /^\/events\/([^/]+)(?:\/[^/]+)?\/?$/;

/** The event id of a workspace page path (`/events/{id}` or one of its tabs), never `/events/new`. */
export function eventPageId(pathname: string): string | null {
  const id = EVENT_PAGE.exec(pathname)?.[1];
  return id && id !== "new" ? id : null;
}

/** True when a signed-in user's page load is for an event they do not own, or one that does not exist. */
export async function eventPageMissing(request: Request, deps: ServerDeps): Promise<boolean> {
  if (request.method !== "GET" || request.headers.has("rsc")) return false;
  const id = eventPageId(new URL(request.url).pathname);
  if (id === null || !deps.db || !deps.sessions) return false;
  try {
    const session = await deps.sessions.verify(sessionCookieOf(request), "read");
    if (!session) return false;
    return (await new EventRepo(deps.db).owned(id, session.uid)) === null;
  } catch {
    return false;
  }
}
