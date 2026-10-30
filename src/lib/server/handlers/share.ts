import { z } from "zod";
import { authorize } from "../auth/guard";
import type { ServerDeps } from "../deps";
import { json, noContent, notFound, readJson } from "../http";
import { EventRepo } from "../repos/events";
import { runtime } from "../runtime";
import { hashShareToken, newShareToken, SHARE_TOKEN_BYTES, shareUrl } from "../shareTokens";
import type { IdContext, IdParams } from "./event";

/**
 * `POST /api/events/[id]/share` creates a read-only link, or updates its options while it is
 * active; `DELETE` revokes it softly: the share doc keeps `revokedAt` for audit, the private token
 * copy is deleted and the page 404s from then on (spec 8.2, 12.1).
 */

const optionsSchema = z.strictObject({ showAmounts: z.boolean(), showNotes: z.boolean() });

export async function shareEvent(request: Request, deps: ServerDeps, params: IdParams): Promise<Response> {
  const auth = await authorize(request, deps, "write");
  if (!auth.ok) return auth.response;
  const body = await readJson(request, optionsSchema);
  if (!body.ok) return body.response;
  const { now } = deps.clock();
  const { uid } = auth.session;
  const eventId = (await params).id;
  const outcome = await new EventRepo(auth.db).withEvent(eventId, uid, async (event, tx) => {
    // Reads first (a Firestore transaction rule): the current token and its share doc, if active.
    const current = event.share.active ? await tx.shareToken() : null;
    const existing = current ? await tx.share(hashShareToken(current)) : null;
    const token = current ?? newShareToken(deps.randomBytes(SHARE_TOKEN_BYTES));
    const tokenHash = hashShareToken(token);
    if (!current) tx.saveShareToken(token);
    tx.saveShare(tokenHash, { eventId, ownerUid: uid, ...body.data, createdAt: existing?.createdAt ?? now, revokedAt: null });
    tx.saveEvent({ ...event, share: { active: true, tokenHash, ...body.data }, updatedAt: now });
    return { token, tokenHash };
  });
  if (!outcome) return notFound();
  deps.caches.shares.delete(outcome.value.tokenHash);
  return json({ url: shareUrl(deps.appOrigin ?? new URL(request.url).origin, outcome.value.token) });
}

export async function revokeShare(request: Request, deps: ServerDeps, params: IdParams): Promise<Response> {
  const auth = await authorize(request, deps, "write");
  if (!auth.ok) return auth.response;
  const { now } = deps.clock();
  const outcome = await new EventRepo(auth.db).withEvent((await params).id, auth.session.uid, async (event, tx) => {
    const { tokenHash } = event.share;
    if (!tokenHash) return null;
    const share = await tx.share(tokenHash);
    if (share) tx.saveShare(tokenHash, { ...share, revokedAt: now });
    tx.saveShareToken(null);
    tx.saveEvent({ ...event, share: { ...event.share, active: false, tokenHash: null }, updatedAt: now });
    return tokenHash;
  });
  if (!outcome) return notFound();
  // Other instances may serve the cached page for up to 60 s more (spec 9.1).
  if (outcome.value) deps.caches.shares.delete(outcome.value);
  return noContent();
}

export const POST = (request: Request, context: IdContext) => shareEvent(request, runtime(), context.params);
export const DELETE = (request: Request, context: IdContext) => revokeShare(request, runtime(), context.params);
