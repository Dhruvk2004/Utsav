import { z } from "zod";
import { undoEntry } from "@/lib/plan/commands";
import { authorize } from "../auth/guard";
import type { ServerDeps } from "../deps";
import { errorResponse, json, notFound, readJson } from "../http";
import { EventRepo } from "../repos/events";
import { runtime } from "../runtime";
import type { IdContext, IdParams } from "./event";

/**
 * `POST /api/events/[id]/undo` (spec 12.1) restores a history entry while nothing has changed
 * since it. Undoing the creation entry is "Start from the starter template instead" (spec 6.2).
 */

const undoSchema = z.strictObject({ historyId: z.string().min(1).max(80) });

export async function undo(request: Request, deps: ServerDeps, params: IdParams): Promise<Response> {
  const auth = await authorize(request, deps, "write");
  if (!auth.ok) return auth.response;
  const body = await readJson(request, undoSchema);
  if (!body.ok) return body.response;
  const clock = deps.clock();
  const outcome = await new EventRepo(auth.db).withEvent((await params).id, auth.session.uid, async (event, tx) => {
    const entry = await tx.history(body.data.historyId);
    if (!entry) return null;
    const result = undoEntry(event, entry, clock);
    if (!result.ok) return result;
    tx.saveEvent(result.event);
    return { ...result, historyId: tx.addHistory(result.history) };
  });
  const result = outcome?.value;
  if (!result) return notFound();
  if (!result.ok) return errorResponse(409, "undo_unavailable", result.reason);
  return json({ event: result.event, historyId: result.historyId });
}

export const POST = (request: Request, context: IdContext) => undo(request, runtime(), context.params);
