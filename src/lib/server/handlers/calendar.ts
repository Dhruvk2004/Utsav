import { buildIcs, icsFileName } from "@/lib/domain/ics";
import { authorize } from "../auth/guard";
import type { ServerDeps } from "../deps";
import { NO_STORE, notFound } from "../http";
import { EventRepo } from "../repos/events";
import { runtime } from "../runtime";
import type { IdContext, IdParams } from "./event";

/** `GET /api/events/[id]/calendar.ics` (spec 5.9, 12.1): the event's calendar file, for its owner only. */
export async function eventCalendar(request: Request, deps: ServerDeps, params: IdParams): Promise<Response> {
  const auth = await authorize(request, deps, "read");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const event = await new EventRepo(auth.db).owned(id, auth.session.uid);
  if (!event) return notFound();
  const { today, now } = deps.clock();
  return new Response(buildIcs(event, id, today, new Date(now)), {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFileName(event)}"`,
    },
  });
}

export const GET = (request: Request, context: IdContext) => eventCalendar(request, runtime(), context.params);
