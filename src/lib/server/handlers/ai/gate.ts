import type { z } from "zod";
import type { EventDoc } from "@/lib/domain/model/event";
import { AI_DAILY_QUOTA, type UserDoc } from "@/lib/domain/model/user";
import type { Clock } from "@/lib/plan/commands";
import { buildProposal, type ProposalDraft } from "@/lib/plan/proposals";
import { authorize } from "../../auth/guard";
import type { Session } from "../../auth/session";
import type { Db } from "../../db/types";
import type { ServerDeps } from "../../deps";
import { errorResponse, notFound, rateLimited, readJson } from "../../http";
import { EventRepo, type StoredProposal } from "../../repos/events";
import { UserRepo } from "../../repos/users";
import { identityOf } from "../profile";
import { addProposal } from "../proposals";

/**
 * The shared front of every signed-in AI route (spec 6.1 pipeline, 9.1): a write session (AI
 * spend is a sensitive action), a JSON body within 10 KB, the caller's own event, and, only when
 * the model is actually called, the per-minute limit and the exact daily quota.
 */

export interface AiCall<T> {
  eventId: string;
  db: Db;
  session: Session;
  event: EventDoc;
  body: T;
  clock: Clock;
}

export type Gate<T> = { ok: true; call: AiCall<T> } | { ok: false; response: Response };

export async function openAiCall<S extends z.ZodType>(
  request: Request,
  deps: ServerDeps,
  params: Promise<{ id: string }>,
  schema: S,
): Promise<Gate<z.output<S>>> {
  const auth = await authorize(request, deps, "write");
  if (!auth.ok) return auth;
  const body = await readJson(request, schema);
  if (!body.ok) return body;
  const { id } = await params;
  const event = await new EventRepo(auth.db).owned(id, auth.session.uid);
  if (!event) return { ok: false, response: notFound() };
  return { ok: true, call: { eventId: id, db: auth.db, session: auth.session, event, body: body.data, clock: deps.clock() } };
}

/** Counts one model call; returns the 429 to send when the user is over a limit, else null. */
export async function spendAi(
  deps: ServerDeps,
  db: Db,
  session: Session,
  clock: Clock,
  instead = "Edit the plan by hand",
): Promise<Response | null> {
  const limit = deps.limits.ai.check(session.uid);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds, "You have used AI a lot in a short time. Try again in a minute.");
  const counted = await new UserRepo(db).consumeAi(session.uid, identityOf(session), AI_DAILY_QUOTA, clock);
  return counted ? null : rateLimited(3600, `You have used today's AI suggestions. ${instead}, or try again tomorrow.`);
}

/** The user's profile, for the personalisation inputs that live there (role, budget style). */
export const profileOf = (db: Db, uid: string): Promise<UserDoc | null> => new UserRepo(db).get(uid);

export const aiUnavailable = () => errorResponse(503, "ai_unavailable", "Could not get suggestions. Your plan is unchanged.");
/** No model on this deployment at all: retrying can't help, so the client says so (MQW-07, CO-08). */
export const aiNotConfigured = () =>
  errorResponse(503, "ai_not_configured", "AI suggestions aren't available on this deployment. Your plan is unchanged.");

/** Logs a failed model call without its prompt or output (spec 9.4). */
export function logFailure(deps: ServerDeps, touchpoint: string, error: unknown): void {
  deps.log("ai_failed", { touchpoint, error: error instanceof Error ? error.name : "unknown" });
}

/** Builds the proposal against the stored plan (each item dry-run) and stores it (spec 6.1). */
export async function saveProposal(call: AiCall<unknown>, draft: ProposalDraft): Promise<StoredProposal | null> {
  const outcome = await new EventRepo(call.db).withEvent(call.eventId, call.session.uid, (event, tx) =>
    addProposal(tx, event, buildProposal(event, draft, call.clock), call.clock.now),
  );
  return outcome?.value ?? null;
}
