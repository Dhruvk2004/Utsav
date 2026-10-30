import type { ModelProbe, PlanModel } from "@/lib/ai/model";
import type { SharedView } from "@/lib/client/shareView";
import type { EnquiryText } from "@/lib/domain/enquiry";
import type { EventPlan } from "@/lib/domain/schemas";
import type { Clock } from "@/lib/plan/commands";
import type { ProposalDraft } from "@/lib/plan/proposals";
import type { SmartReply } from "@/lib/plan/smartPlan";
import type { SessionAuth, SessionVerifier } from "./auth/session";
import { TtlCache } from "./cache";
import type { Db } from "./db/types";
import type { DemoQuota } from "./demoQuota";
import { RateLimiter } from "./rateLimit";

/**
 * Everything a route handler needs, passed in so handlers are plain functions of
 * `(request, deps)`. `runtime()` builds the production set once per server instance; tests build
 * their own with an in-memory database and a fake Firebase Auth.
 */
export interface ServerDeps {
  /** Null when Firebase is not configured: signed-in routes answer 503, public pages still work. */
  db: Db | null;
  auth: SessionAuth | null;
  sessions: SessionVerifier | null;
  model: PlanModel | null;
  probe: ModelProbe;
  appOrigin: string | null;
  clock(): Clock;
  /** Secure random bytes (share tokens). */
  randomBytes(size: number): Uint8Array;
  limits: Limits;
  caches: Caches;
  /** The demo's global daily cap on live AI calls. */
  demoQuota: DemoQuota;
  log: Logger;
}

export interface Limits {
  /** Session create: 10/min per IP. */
  session: RateLimiter;
  /** Mutations: 60/min per uid. */
  mutation: RateLimiter;
  /** AI calls (every touchpoint): 6/min per uid, plus the daily quota in Firestore. */
  ai: RateLimiter;
  /** Share page: 30/min per IP. */
  share: RateLimiter;
  /** Public demo live AI: 5/hour per IP; past it the demo answers with recordings. */
  demo: RateLimiter;
}

export interface HealthReport {
  status: "ok";
  firestore: "ok" | "error" | "not_configured";
  model: { id: string; location: string; reachable: boolean };
}

export interface Caches {
  /** Generated plans for 1 h, keyed by uid + prompt input (spec 6.2). */
  plans: TtlCache<EventPlan>;
  /** Share page projections for 60 s, keyed by token hash (spec 9.1). */
  shares: TtlCache<SharedView>;
  /** Health probes for 60 s (spec 9.6). */
  health: TtlCache<HealthReport>;
  /** AI-mode and ideas answers (before the dry run) for 10 min, keyed by user, event version and input. */
  suggestions: TtlCache<ProposalDraft>;
  /** Smart re-plans for 10 min. */
  smartPlans: TtlCache<SmartReply & { filtered: boolean }>;
  /** Enquiry drafts for 10 min by vendor and options (spec 9.3). */
  enquiries: TtlCache<EnquiryText & { origin: "ai" | "template"; filtered: boolean }>;
  /** Drafts the server generated, by `generatedDraftId`, so saving one unchanged keeps its origin (spec 8.2). */
  generatedDrafts: TtlCache<GeneratedDraft>;
}

export interface GeneratedDraft {
  vendorId: string;
  body: string;
  origin: "ai" | "template";
}

export type Logger = (event: string, fields?: Record<string, unknown>) => void;

const MINUTE = 60_000;

export function createLimits(clock: () => number = Date.now): Limits {
  return {
    session: new RateLimiter(10, MINUTE, clock),
    mutation: new RateLimiter(60, MINUTE, clock),
    ai: new RateLimiter(6, MINUTE, clock),
    share: new RateLimiter(30, MINUTE, clock),
    demo: new RateLimiter(5, 60 * MINUTE, clock),
  };
}

export function createCaches(clock: () => number = Date.now): Caches {
  return {
    plans: new TtlCache<EventPlan>(200, 60 * MINUTE, clock),
    shares: new TtlCache<SharedView>(500, MINUTE, clock),
    health: new TtlCache<HealthReport>(1, MINUTE, clock),
    suggestions: new TtlCache<ProposalDraft>(500, 10 * MINUTE, clock),
    smartPlans: new TtlCache<SmartReply & { filtered: boolean }>(200, 10 * MINUTE, clock),
    enquiries: new TtlCache<EnquiryText & { origin: "ai" | "template"; filtered: boolean }>(500, 10 * MINUTE, clock),
    generatedDrafts: new TtlCache<GeneratedDraft>(1_000, 60 * MINUTE, clock),
  };
}
