import { io } from "next/cache";
import { headers } from "next/headers";
import { isShareToken, toSharedView, type SharedView } from "@/lib/client/shareView";
import { deriveView } from "@/lib/domain/view";
import type { ServerDeps } from "../deps";
import { clientIp } from "../rateLimit";
import { EventRepo } from "../repos/events";
import { runtime } from "../runtime";
import { hashShareToken } from "../shareTokens";

/**
 * The shared plan page's data (spec 8.3, 10.15): format check before any read, then the share doc
 * by token hash (missing or revoked is a 404), then the event's read-only projection, cached for
 * 60 s by hash. Rate limited per IP.
 */

export type SharedPlanResult = { kind: "found"; view: SharedView } | { kind: "not_found" } | { kind: "rate_limited" };

export async function sharedPlanFor(token: string, ip: string, deps: ServerDeps): Promise<SharedPlanResult> {
  if (!isShareToken(token) || !deps.db) return { kind: "not_found" };
  if (!deps.limits.share.check(ip).allowed) return { kind: "rate_limited" };
  const tokenHash = hashShareToken(token);
  const cached = deps.caches.shares.get(tokenHash);
  if (cached) return { kind: "found", view: cached };
  const repo = new EventRepo(deps.db);
  const share = await repo.findShare(tokenHash);
  if (!share || share.revokedAt) return { kind: "not_found" };
  const event = await repo.get(share.eventId);
  if (!event || event.ownerUid !== share.ownerUid) return { kind: "not_found" };
  const { today } = deps.clock();
  const view = toSharedView(event, deriveView(event, today), {
    showAmounts: share.showAmounts,
    showNotes: share.showNotes,
    showTitle: false,
  });
  deps.caches.shares.set(tokenHash, view);
  return { kind: "found", view };
}

export async function loadSharedPlan(token: string): Promise<SharedPlanResult> {
  const ip = clientIp(await headers());
  // The rate limiter and the projection cache read the clock: request time only (QA-10).
  await io();
  return sharedPlanFor(token, ip, runtime());
}
