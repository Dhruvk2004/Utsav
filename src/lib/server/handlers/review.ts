import { z } from "zod";
import { REVIEW_SECTIONS } from "@/lib/domain/model/enums";
import { markReviewed } from "@/lib/plan/commands";
import { authorize } from "../auth/guard";
import type { ServerDeps } from "../deps";
import { json, notFound, readJson } from "../http";
import { EventRepo } from "../repos/events";
import { runtime } from "../runtime";
import type { IdContext, IdParams } from "./event";

/** `PUT /api/events/[id]/review` (spec 12.1): the review banner's "Looks good"; no plan change, no version bump. */

const reviewSchema = z.strictObject({ section: z.enum(REVIEW_SECTIONS), state: z.enum(["reviewed", "reset"]) });

export async function putReview(request: Request, deps: ServerDeps, params: IdParams): Promise<Response> {
  const auth = await authorize(request, deps, "write");
  if (!auth.ok) return auth.response;
  const body = await readJson(request, reviewSchema);
  if (!body.ok) return body.response;
  const { now } = deps.clock();
  const outcome = await new EventRepo(auth.db).withEvent((await params).id, auth.session.uid, async (event, tx) => {
    const next = markReviewed(event, body.data.section, body.data.state, now);
    if (next) tx.saveEvent(next);
    return next;
  });
  const event = outcome?.value;
  return event ? json({ review: event.review }) : notFound();
}

export const PUT = (request: Request, context: IdContext) => putReview(request, runtime(), context.params);
