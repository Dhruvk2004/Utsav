import type { Fetch } from "@/lib/data/api";
import type { ServerDeps } from "@/lib/server/deps";
import { draftEnquiry } from "@/lib/server/handlers/ai/enquiry";
import { suggestIdeas } from "@/lib/server/handlers/ai/ideas";
import { instructEvent } from "@/lib/server/handlers/ai/instruct";
import { smartReplan } from "@/lib/server/handlers/ai/whatif";
import { decideProposal } from "@/lib/server/handlers/decide";
import { demoIdeas } from "@/lib/server/handlers/demo/ideas";
import { demoInstruct } from "@/lib/server/handlers/demo/instruct";
import { revokeShare, shareEvent } from "@/lib/server/handlers/share";
import { deleteEvent, getEvent, patchEvent } from "@/lib/server/handlers/event";
import { createEvent, listEvents } from "@/lib/server/handlers/events";
import { getProfile, putProfile } from "@/lib/server/handlers/profile";
import { createProposal, listWaiting } from "@/lib/server/handlers/proposals";
import { putReview } from "@/lib/server/handlers/review";
import { createSession, deleteSession } from "@/lib/server/handlers/session";
import { undo } from "@/lib/server/handlers/undo";
import { ORIGIN, sessionCookie } from "./server";

/**
 * A `fetch` that runs the real route handlers in process against test deps, as the browser would
 * call them: same origin, with the user's session cookie. Client stores are tested end to end.
 */

type Handler = (request: Request, deps: ServerDeps, params: Promise<Record<string, string>>) => Promise<Response>;
type Id = Promise<{ id: string }>;
type Sample = Promise<{ sample: string }>;
type Routes = [RegExp, string[], Partial<Record<string, Handler>>][];

const ROUTES: Routes = [
  [/^\/api\/session$/, [], { POST: (r, d) => createSession(r, d), DELETE: (r, d) => deleteSession(r, d) }],
  [/^\/api\/profile$/, [], { GET: (r, d) => getProfile(r, d), PUT: (r, d) => putProfile(r, d) }],
  [/^\/api\/events$/, [], { GET: (r, d) => listEvents(r, d), POST: (r, d) => createEvent(r, d) }],
  [
    /^\/api\/events\/([^/]+)$/,
    ["id"],
    {
      GET: (r, d, p) => getEvent(r, d, p as Promise<{ id: string }>),
      PATCH: (r, d, p) => patchEvent(r, d, p as Promise<{ id: string }>),
      DELETE: (r, d, p) => deleteEvent(r, d, p as Promise<{ id: string }>),
    },
  ],
  [/^\/api\/events\/([^/]+)\/undo$/, ["id"], { POST: (r, d, p) => undo(r, d, p as Promise<{ id: string }>) }],
  [/^\/api\/events\/([^/]+)\/review$/, ["id"], { PUT: (r, d, p) => putReview(r, d, p as Promise<{ id: string }>) }],
  [
    /^\/api\/events\/([^/]+)\/proposals$/,
    ["id"],
    { GET: (r, d, p) => listWaiting(r, d, p as Id), POST: (r, d, p) => createProposal(r, d, p as Promise<{ id: string }>) },
  ],
  [
    /^\/api\/events\/([^/]+)\/proposals\/([^/]+)\/decide$/,
    ["id", "pid"],
    { POST: (r, d, p) => decideProposal(r, d, p as Promise<{ id: string; pid: string }>) },
  ],
  [
    /^\/api\/events\/([^/]+)\/share$/,
    ["id"],
    { POST: (r, d, p) => shareEvent(r, d, p as Id), DELETE: (r, d, p) => revokeShare(r, d, p as Id) },
  ],
  [/^\/api\/events\/([^/]+)\/ai\/instruct$/, ["id"], { POST: (r, d, p) => instructEvent(r, d, p as Id) }],
  [/^\/api\/events\/([^/]+)\/ai\/ideas$/, ["id"], { POST: (r, d, p) => suggestIdeas(r, d, p as Id) }],
  [/^\/api\/events\/([^/]+)\/ai\/whatif$/, ["id"], { POST: (r, d, p) => smartReplan(r, d, p as Id) }],
  [/^\/api\/events\/([^/]+)\/ai\/enquiry$/, ["id"], { POST: (r, d, p) => draftEnquiry(r, d, p as Id) }],
  [/^\/api\/demo\/([^/]+)\/ai\/instruct$/, ["sample"], { POST: (r, d, p) => demoInstruct(r, d, p as Sample) }],
  [/^\/api\/demo\/([^/]+)\/ai\/ideas$/, ["sample"], { POST: (r, d, p) => demoIdeas(r, d, p as Sample) }],
];

export function inProcessFetch(deps: ServerDeps, cookie: string | null = sessionCookie()): Fetch & { calls: string[] } {
  const calls: string[] = [];
  const fetcher = async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push(`${method} ${input}`);
    const headers = new Headers(init.headers);
    headers.set("origin", ORIGIN);
    if (cookie) headers.set("cookie", cookie);
    const request = new Request(`${ORIGIN}${input}`, { method, headers, body: init.body });
    for (const [pattern, names, handlers] of ROUTES) {
      const match = pattern.exec(input);
      const handler = match ? handlers[method] : undefined;
      if (match && handler)
        return handler(
          request,
          deps,
          Promise.resolve(Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(match[i + 1])]))),
        );
    }
    return Response.json({ error: { code: "not_found", message: "No route" } }, { status: 404 });
  };
  return Object.assign(fetcher, { calls });
}
