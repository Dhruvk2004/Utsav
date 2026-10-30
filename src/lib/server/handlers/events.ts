import { generatePlan } from "@/lib/ai/planService";
import { createEventDateIssues, createEventSchema, type CreateEventRequest } from "@/lib/domain/model/createEvent";
import type { UserDoc } from "@/lib/domain/model/user";
import { buildPlan } from "@/lib/domain/planner";
import type { EventPlan } from "@/lib/domain/schemas";
import { templateDraft } from "@/lib/domain/template";
import type { Clock } from "@/lib/plan/commands";
import { creationHistory, planContextOf, planInputOf, planToEventDoc, templateEventDoc } from "@/lib/plan/newEvent";
import { authorize } from "../auth/guard";
import type { Session } from "../auth/session";
import { stableKey } from "../cache";
import type { Db } from "../db/types";
import type { ServerDeps } from "../deps";
import { errorResponse, json, readJson } from "../http";
import { EventRepo } from "../repos/events";
import { UserRepo } from "../repos/users";
import { runtime } from "../runtime";
import { spendAi } from "./ai/gate";

/** `GET /api/events` (dashboard cards) and `POST /api/events` (create, spec 5.1 and 12.1). */

export async function listEvents(request: Request, deps: ServerDeps): Promise<Response> {
  const auth = await authorize(request, deps, "read");
  if (!auth.ok) return auth.response;
  return json({ events: await new EventRepo(auth.db).summaries(auth.session.uid) });
}

type Generated = { ok: true; plan: EventPlan } | { ok: false; response: Response };

/**
 * What a failed model call may log: its type and HTTP status, plus the API's own text for a rejected
 * request (4xx), which describes the request. Other messages are left out, as they can quote AI output.
 */
function modelErrorFields(error: unknown): { error: string; status?: number; detail?: string } {
  if (!(error instanceof Error)) return { error: "unknown" };
  const status = (error as { status?: unknown }).status;
  if (typeof status !== "number") return { error: error.name };
  return { error: error.name, status, ...(status >= 400 && status < 500 ? { detail: error.message.slice(0, 300) } : {}) };
}

/**
 * The plan for an AI request: from the per-user cache (keyed without the title, spec 6.2), else
 * from the model within the per-minute limit and the daily quota, else the starter template.
 */
async function aiPlan(
  request: Request,
  deps: ServerDeps,
  db: Db,
  session: Session,
  input: CreateEventRequest,
  profile: UserDoc | null,
  clock: Clock,
): Promise<Generated> {
  const planInput = planInputOf(input);
  const context = planContextOf(input, profile);
  const key = `${session.uid}:${stableKey({ ...planInput, title: "", context, today: clock.today })}`;
  const cached = deps.caches.plans.get(key);
  if (cached) return { ok: true, plan: cached };
  if (deps.model) {
    const refused = await spendAi(deps, db, session, clock, "Create a blank plan");
    if (refused) return { ok: false, response: refused };
  }
  const started = Date.now();
  const plan = await generatePlan(planInput, {
    model: deps.model,
    today: clock.today,
    context,
    signal: request.signal,
    onError: (error, attempt) => deps.log("plan_attempt_failed", { attempt, ...modelErrorFields(error) }),
  });
  deps.log("plan_generated", { uid: session.uid, source: plan.source, latencyMs: Date.now() - started, model: deps.model?.name ?? null });
  // Only real AI plans are cached, so a temporary outage doesn't stick.
  if (plan.source === "ai") deps.caches.plans.set(key, plan);
  return { ok: true, plan };
}

/**
 * Events one account may keep (SEC-12). The write rate limit alone would allow about 86,000 a day.
 * Checked before the transaction, so two creates at the same instant may pass it together; the
 * write limit bounds that overshoot.
 */
export const MAX_EVENTS_PER_USER = 100;

export async function createEvent(request: Request, deps: ServerDeps): Promise<Response> {
  const auth = await authorize(request, deps, "write");
  if (!auth.ok) return auth.response;
  const body = await readJson(request, createEventSchema);
  if (!body.ok) return body.response;
  const input = body.data;
  const clock = deps.clock();
  const dateIssues = createEventDateIssues(input, clock.today);
  if (dateIssues.length > 0) {
    const fields = Object.fromEntries(dateIssues.map((issue) => [issue.path.join("."), issue.message]));
    return errorResponse(400, "invalid_input", "Some details need fixing.", { fields });
  }

  const { session, db } = auth;
  const repo = new EventRepo(db);
  if ((await repo.ownedIds(session.uid)).length >= MAX_EVENTS_PER_USER) {
    return errorResponse(
      409,
      "event_limit",
      `You can keep up to ${MAX_EVENTS_PER_USER} events. Delete one you no longer need to create another.`,
    );
  }
  const profile = await new UserRepo(db).get(session.uid);
  let plan: EventPlan;
  if (input.mode === "ai") {
    const generated = await aiPlan(request, deps, db, session, input, profile, clock);
    if (!generated.ok) return generated.response;
    plan = generated.plan;
  } else {
    const planInput = planInputOf(input);
    plan = buildPlan(planInput, templateDraft(planInput, input.occasion), {
      today: clock.today,
      source: "template",
      now: new Date(clock.now),
    });
  }

  const source = input.mode === "blank" ? "blank" : plan.source;
  const options = { ownerUid: session.uid, today: clock.today, now: clock.now, budgetStyle: profile?.budgetStyle ?? null };
  const event = planToEventDoc(plan, input, { ...options, source });
  const creation = source === "ai" ? creationHistory(event, templateEventDoc(input, options), clock) : null;
  const eventId = await repo.create(event, creation);
  return json({ eventId, source }, { status: 201 });
}

export const GET = (request: Request) => listEvents(request, runtime());
export const POST = (request: Request) => createEvent(request, runtime());
