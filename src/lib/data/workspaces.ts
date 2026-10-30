import type { Proposal } from "@/lib/domain/model/records";
import { ServerPlanStore } from "@/lib/plan/ServerPlanStore";
import type { PlanStore, ReviewControls } from "@/lib/plan/PlanStore";
import { buildProposal, type ProposalDraft } from "@/lib/plan/proposals";
import type { EventDoc } from "@/lib/domain/model/event";
import type { AiClient } from "./aiClient";
import { HttpAiClient } from "./httpAiClient";
import { HttpPlanApi, type PlanApi } from "./planApi";

/**
 * Everything one open event needs: its plan store, AI client, review controls (signed-in only)
 * and code-generated proposals ("Add to plan", "Reset section"; `POST /proposals` on the server).
 * The demo builds the same shape over a sandbox, so every workspace component works in both.
 */
export interface Workspace {
  store: PlanStore;
  ai: AiClient;
  review: ReviewControls | null;
  /** Event settings actions; the demo has none. */
  manage: EventControls | null;
  today: string;
  createProposal(draft: ProposalDraft): Promise<Proposal>;
  /** False when this deployment has no AI model: AI-only controls explain that instead of failing (MQW-07). */
  aiAvailable?: boolean;
  /** Stored proposals with undecided items, so waiting suggestions survive a reload (CO-02); signed-in only. */
  waitingProposals?(signal?: AbortSignal): Promise<Proposal[]>;
}

export interface ShareOptions {
  showAmounts: boolean;
  showNotes: boolean;
}

/** Event settings (spec 5.9): the share link, the calendar file and deleting the event. */
export interface EventControls {
  /** Creates the read-only link, or updates its options while it is active; resolves to the link. */
  share(options: ShareOptions): Promise<string>;
  /** Soft revoke: the link stops working at once. */
  revokeShare(): Promise<void>;
  /** Hard delete; `confirmTitle` is what the user typed. */
  remove(confirmTitle: string): Promise<void>;
  calendarHref: string;
}

export interface WorkspaceRepository {
  /** The event's workspace, or null when it does not exist or is not the user's (shown as a 404). */
  open(eventId: string, signal?: AbortSignal): Promise<Workspace | null>;
}

/** Code proposals built in the browser, labelled "Suggested by Utsav". */
export function localProposals(store: PlanStore, today: string, now: () => string = () => new Date().toISOString()) {
  return async (draft: ProposalDraft) => buildProposal(store.getPlan(), draft, { today, now: now() });
}

/**
 * The signed-in workspace over the API (spec 12.1): the event from `GET /api/events/[id]` in a
 * `ServerPlanStore`, AI suggestions from `/ai/*`, code proposals stored by `POST /proposals`, and
 * the event settings actions.
 */
export class HttpWorkspaceRepository implements WorkspaceRepository {
  constructor(
    private readonly today: () => string,
    private readonly apiFor: (eventId: string) => PlanApi = (eventId) => new HttpPlanApi(eventId),
    private readonly aiFor: (eventId: string, plan: () => EventDoc) => AiClient = (eventId, plan) => new HttpAiClient(eventId, plan),
  ) {}

  async open(eventId: string, signal?: AbortSignal): Promise<Workspace | null> {
    const api = this.apiFor(eventId);
    const opened = await api.open(signal);
    if (!opened) return null;
    const today = this.today();
    const store = new ServerPlanStore(opened.event, api);
    return {
      aiAvailable: opened.aiAvailable,
      waitingProposals: (waitSignal) => api.waiting(waitSignal),
      store,
      review: store,
      manage: {
        share: (options) => api.share(options),
        revokeShare: () => api.revokeShare(),
        remove: (confirmTitle) => api.remove(confirmTitle),
        calendarHref: `/api/events/${encodeURIComponent(eventId)}/calendar.ics`,
      },
      today,
      ai: this.aiFor(eventId, () => store.getPlan()),
      createProposal: (draft) =>
        api.createProposal({
          touchpoint: draft.touchpoint,
          baseVersion: store.getPlan().version,
          instruction: draft.instruction,
          items: draft.items.map((item) => ({ op: item.op, dependsOn: item.dependsOn ?? [], rationale: item.rationale ?? "" })),
        }),
    };
  }
}
