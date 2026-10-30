import { z } from "zod";
import { defaultEventTitle } from "@/lib/domain/labels";
import { planOperationSchema } from "@/lib/domain/ops/schema";
import { applyManual, CONFLICT_MESSAGE } from "@/lib/plan/commands";
import { authorize } from "../auth/guard";
import type { ServerDeps } from "../deps";
import { errorResponse, json, MAX_APPLY_BODY_BYTES, noContent, notFound, readJson } from "../http";
import { EventRepo } from "../repos/events";
import { runtime } from "../runtime";

/** `GET/PATCH/DELETE /api/events/[id]` (spec 12.1): one event, manual edits, and hard delete. */

export type IdParams = Promise<{ id: string }>;
export interface IdContext {
  params: IdParams;
}

export async function getEvent(request: Request, deps: ServerDeps, params: IdParams): Promise<Response> {
  const auth = await authorize(request, deps, "read");
  if (!auth.ok) return auth.response;
  const event = await new EventRepo(auth.db).owned((await params).id, auth.session.uid);
  // `ai.available` lets AI-only controls explain a deployment without a model up front (MQW-07).
  return event ? json({ event, ai: { available: deps.model !== null } }) : notFound();
}

const MAX_OPS = 50;
const patchSchema = z.strictObject({ baseVersion: z.number().int().min(0), ops: z.array(planOperationSchema).min(1).max(MAX_OPS) });

/** Manual edits (actor `user`), all or nothing, with optimistic concurrency on `baseVersion`. */
export async function patchEvent(request: Request, deps: ServerDeps, params: IdParams): Promise<Response> {
  const auth = await authorize(request, deps, "write");
  if (!auth.ok) return auth.response;
  const body = await readJson(request, patchSchema, MAX_APPLY_BODY_BYTES);
  if (!body.ok) return body.response;
  const clock = deps.clock();
  const { uid } = auth.session;
  const { id } = await params;
  // A draft saved exactly as the server generated it keeps its origin (spec 8.2); anything else is the user's.
  const draftOrigin = (vendorId: string, generatedDraftId: string, text: string) => {
    const generated = deps.caches.generatedDrafts.get(`${uid}:${id}:${generatedDraftId}`);
    return generated?.vendorId === vendorId && generated.body === text ? generated.origin : null;
  };
  const outcome = await new EventRepo(auth.db).withEvent(id, uid, async (event, tx) => {
    const result = applyManual(event, body.data.baseVersion, body.data.ops, clock, draftOrigin);
    if (!result.ok) return result;
    tx.saveEvent(result.event);
    return { ...result, historyId: tx.addHistory(result.history) };
  });
  if (!outcome) return notFound();
  const result = outcome.value;
  if (result.ok) return json({ event: result.event, historyId: result.historyId });
  if (result.kind === "conflict") return errorResponse(409, "version_conflict", CONFLICT_MESSAGE, { event: result.event });
  return errorResponse(422, "change_rejected", result.reason, { results: result.results });
}

const deleteSchema = z.strictObject({ confirmTitle: z.string().max(80) });

/** Hard delete with history, proposals and share docs (spec 5.9); the user types the title to confirm. */
export async function deleteEvent(request: Request, deps: ServerDeps, params: IdParams): Promise<Response> {
  const auth = await authorize(request, deps, "write");
  if (!auth.ok) return auth.response;
  const body = await readJson(request, deleteSchema);
  if (!body.ok) return body.response;
  const repo = new EventRepo(auth.db);
  const { id } = await params;
  const event = await repo.owned(id, auth.session.uid);
  if (!event) return notFound();
  const title = event.details.title || defaultEventTitle(event.details);
  if (body.data.confirmTitle.trim() !== title) {
    return errorResponse(400, "invalid_input", "Type the event's name to confirm.", {
      fields: { confirmTitle: `Type “${title}” to confirm.` },
    });
  }
  for (const tokenHash of await repo.delete(id)) deps.caches.shares.delete(tokenHash);
  if (event.share.tokenHash) deps.caches.shares.delete(event.share.tokenHash);
  return noContent();
}

export const GET = (request: Request, context: IdContext) => getEvent(request, runtime(), context.params);
export const PATCH = (request: Request, context: IdContext) => patchEvent(request, runtime(), context.params);
export const DELETE = (request: Request, context: IdContext) => deleteEvent(request, runtime(), context.params);
