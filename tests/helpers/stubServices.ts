import { sampleEvent } from "@/lib/demo/fixtures";
import { demoEvent } from "@/lib/demo/build";
import type { DemoSample } from "@/lib/demo/resolveDates";
import { RecordedAiClient } from "@/lib/data/aiClient";
import type { AuthClient, SignInResult } from "@/lib/data/authClient";
import type { CreatedEvent, EventsRepository, EventSummary, PlanSource } from "@/lib/data/eventsRepository";
import type { ProfileStore } from "@/lib/data/profileStore";
import type { Services } from "@/lib/data/services";
import { localProposals, type Workspace, type WorkspaceRepository } from "@/lib/data/workspaces";
import { wait } from "@/lib/data/wait";
import { buildBudgetLines } from "@/lib/domain/budget";
import { addDays, todayInIndia } from "@/lib/domain/dates";
import { detailsFromRequest, type CreateEventRequest } from "@/lib/domain/model/createEvent";
import type { EventDetails, EventDoc, PlanStats } from "@/lib/domain/model/event";
import { applyProfilePatch, type ProfilePatch, type UserProfile } from "@/lib/domain/model/user";
import { finalizePlan } from "@/lib/domain/ops/apply";
import type { EventType } from "@/lib/domain/schemas";
import { templateDraft } from "@/lib/domain/template";
import { slugId } from "@/lib/domain/timeline";
import { LocalPlanStore } from "@/lib/plan/LocalPlanStore";

/**
 * Test doubles for every data interface (moved out of `src` so production code carries no fixtures).
 * Fixture services for tests: in-memory implementations of every data interface, seeded with a
 * persona and events that follow the design mockups. Nothing here is a real person. Dates are
 * relative to `today` so the cards always read sensibly. The app itself uses `createHttpServices`.
 */

export const STUB_PROFILE: UserProfile = {
  displayName: "Ananya Kulkarni",
  photoURL: null,
  email: "ananya@example.com",
  homeCity: "",
  language: "en",
  role: null,
  eventTypes: [],
  traditions: [],
  traditionOther: "",
  dietary: [],
  budgetStyle: null,
  detailLevel: "everything",
  onboardedAt: null,
  aiUsage: { day: "2026-10-28", count: 0 },
};

function details(partial: Partial<EventDetails> & Pick<EventDetails, "eventType" | "eventDate" | "city">): EventDetails {
  return {
    title: "",
    occasion: null,
    occasionOther: "",
    milestone: null,
    language: "en",
    vibe: "",
    theme: "",
    tradition: [],
    traditionOther: "",
    dietary: [],
    ...partial,
  };
}

function stats(partial: Partial<PlanStats>): PlanStats {
  return {
    tasksDone: 0,
    tasksTotal: 0,
    openDueDates: [],
    vendorsByStatus: { to_research: 0, contacted: 0, quoted: 0, booked: 0, paid: 0, not_needed: 0 },
    committed: 0,
    pending: { count: 0, expireAt: null },
    ...partial,
  };
}

/** Four events: a wedding with AI suggestions waiting, a birthday with an overdue task, a template anniversary, and a past housewarming. */
export function stubEventSummaries(today: string): EventSummary[] {
  return [
    {
      id: "stub-wedding",
      status: "active",
      source: "ai",
      details: details({ eventType: "wedding", title: "Ananya & Rohan's wedding", eventDate: addDays(today, 47), city: "Pune" }),
      guests: 350,
      budgetTotal: 2_500_000,
      stats: stats({
        tasksDone: 12,
        tasksTotal: 34,
        openDueDates: [addDays(today, 2), addDays(today, 5), addDays(today, 20)],
        vendorsByStatus: { to_research: 3, contacted: 2, quoted: 1, booked: 2, paid: 1, not_needed: 1 },
        committed: 1_118_000,
        pending: { count: 2, expireAt: null },
      }),
    },
    {
      id: "stub-birthday",
      status: "active",
      source: "ai",
      details: details({ eventType: "birthday", title: "Aadhya turns 6", milestone: 6, eventDate: addDays(today, 38), city: "Bengaluru" }),
      guests: 40,
      budgetTotal: 60_000,
      stats: stats({ tasksDone: 3, tasksTotal: 17, openDueDates: [addDays(today, -1), addDays(today, 12)] }),
    },
    {
      id: "stub-anniversary",
      status: "active",
      source: "template",
      details: details({ eventType: "anniversary", milestone: 60, eventDate: addDays(today, 92), city: "Nashik" }),
      guests: 60,
      budgetTotal: 150_000,
      stats: stats({ tasksTotal: 20, openDueDates: [addDays(today, 30)] }),
    },
    {
      id: "stub-housewarming",
      status: "active",
      source: "ai",
      details: details({ eventType: "other", occasion: "housewarming", eventDate: addDays(today, -20), city: "Pune" }),
      guests: 45,
      budgetTotal: 80_000,
      stats: stats({ tasksDone: 14, tasksTotal: 14 }),
    },
  ];
}

/** Fixture services, one set per test. A latency lets loading states show. */
export function createStubServices(latencyMs = 400): Services {
  const profiles = new InMemoryProfileStore(STUB_PROFILE);
  const events = new InMemoryEventsRepository(() => stubEventSummaries(todayInIndia()), latencyMs);
  return {
    profiles,
    auth: new StubAuthClient(profiles),
    events,
    workspaces: new StubWorkspaceRepository(events, todayInIndia),
  };
}

const EMPTY_STATS: PlanStats = {
  tasksDone: 0,
  tasksTotal: 0,
  openDueDates: [],
  vendorsByStatus: { to_research: 0, contacted: 0, quoted: 0, booked: 0, paid: 0, not_needed: 0 },
  committed: 0,
  pending: { count: 0, expireAt: null },
};

/** Test repository: lists the seeded summaries plus anything created since, after `latencyMs`. */
export class InMemoryEventsRepository implements EventsRepository {
  private created: EventSummary[] = [];

  constructor(
    private readonly seed: () => EventSummary[],
    private readonly latencyMs = 0,
  ) {}

  async list(signal?: AbortSignal): Promise<EventSummary[]> {
    await wait(this.latencyMs, signal);
    return [...this.seed(), ...this.created];
  }

  async create(request: CreateEventRequest, signal?: AbortSignal): Promise<CreatedEvent> {
    await wait(this.latencyMs, signal);
    const eventId = `new-event-${this.created.length + 1}`;
    const source: PlanSource = request.mode === "blank" ? "blank" : "ai";
    this.created.push({
      id: eventId,
      status: "active",
      source,
      details: detailsFromRequest(request),
      guests: request.guestCount,
      budgetTotal: request.budget,
      stats: EMPTY_STATS,
    });
    return { eventId, source };
  }
}

/** Test store: holds one profile in memory and applies the same merge rule as the server. */
export class InMemoryProfileStore implements ProfileStore {
  private profile: UserProfile;

  constructor(
    initial: UserProfile,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.profile = initial;
  }

  async load(): Promise<UserProfile> {
    return this.profile;
  }

  async save(patch: ProfilePatch): Promise<UserProfile> {
    this.profile = applyProfilePatch(this.profile, patch, this.now());
    return this.profile;
  }
}

/** Test client: every sign-in succeeds as the stub profile; onboarding state comes from that profile. */
export class StubAuthClient implements AuthClient {
  constructor(private readonly profiles: ProfileStore) {}

  preload(): void {}

  async signIn(): Promise<SignInResult> {
    const profile = await this.profiles.load();
    return { ok: true, onboarded: profile.onboardedAt !== null };
  }

  async signInWithRedirect(): Promise<void> {}

  async completeRedirect(): Promise<SignInResult | null> {
    return null;
  }

  async signOut(): Promise<void> {}
}

/**
 * Test fixtures: the full plan behind each fixture dashboard card. The
 * seeded wedding and birthday reuse the demo samples' content on their own dates; anything else
 * (including events created in the wizard) gets the starter template for its details.
 */

const PENDING_REVIEW = { budget: "pending", timeline: "pending", vendors: "pending", ideas: "pending" } as const;

/** The starter template as a stored event. Items are marked as the plan's author wrote them. */
export function starterPlan(summary: EventSummary, today: string): EventDoc {
  const { details } = summary;
  const draft = templateDraft({ ...details, guestCount: summary.guests, budget: summary.budgetTotal, functions: [] }, details.occasion);
  const origin = summary.source === "ai" ? "ai" : "code";
  const clock = { eventDate: details.eventDate, today };
  const plan = demoEvent(clock, {
    details,
    summary: { text: draft.summary, origin },
    budget: {
      total: summary.budgetTotal,
      lines: buildBudgetLines(summary.budgetTotal, draft.budget).map((line) => ({ ...line, id: slugId("line", line.category), origin })),
    },
    functions: [],
    tasks: draft.tasks.map((task) => ({
      ...task,
      id: slugId("task", task.title),
      pinnedDate: null,
      functionId: null,
      done: false,
      doneAt: null,
      origin,
    })),
    vendors: draft.vendors.map((vendor) => ({
      ...vendor,
      id: slugId("vendor", vendor.category),
      label: "",
      budgetLineId: null,
      functionIds: [],
      status: "to_research",
      quotedAmount: null,
      paidAmount: 0,
      notes: "",
      contact: "",
      history: [],
      drafts: [],
      origin,
    })),
    ideas: [],
    guests: {
      total: summary.guests,
      adults: null,
      kids: null,
      elderly: null,
      veg: null,
      jain: null,
      nonveg: null,
      outstation: null,
      cateringBufferPercent: 10,
    },
  });
  return finalizePlan(
    { ...plan, ownerUid: "stub", source: summary.source, review: summary.source === "ai" ? PENDING_REVIEW : null },
    today,
  );
}

/** The plan for one stub summary: the seeded wedding (state S1) and birthday (fresh, under review), else the starter template. */
export function stubPlan(summary: EventSummary, today: string): EventDoc {
  const clock = { eventDate: summary.details.eventDate, today };
  const owned = (plan: EventDoc): EventDoc => ({ ...plan, ownerUid: "stub", details: { ...plan.details, title: summary.details.title } });
  if (summary.id === "stub-wedding") return owned(sampleEvent("wedding", clock));
  if (summary.id === "stub-birthday") {
    const plan = owned(sampleEvent("birthday", clock));
    return {
      ...plan,
      review: { ...PENDING_REVIEW, budget: "reviewed" },
      ideas: plan.ideas.map((idea) => ({ ...idea, state: "suggested" })),
    };
  }
  return starterPlan(summary, today);
}

/** Which recordings answer the fake AI for an event type; anniversaries and others share the wedding's. */
export const RECORDING_SAMPLE: Record<EventType, DemoSample> = {
  wedding: "wedding",
  birthday: "birthday",
  anniversary: "wedding",
  community: "community",
  other: "wedding",
};

/** Test repository: opens the stub events in memory for this page load. */
export class StubWorkspaceRepository implements WorkspaceRepository {
  private readonly opened = new Map<string, Workspace>();

  constructor(
    private readonly events: EventsRepository,
    private readonly today: () => string,
    private readonly latencyMs = 0,
  ) {}

  async open(eventId: string, signal?: AbortSignal): Promise<Workspace | null> {
    const cached = this.opened.get(eventId);
    if (cached) return cached;
    const summary = (await this.events.list(signal)).find((event) => event.id === eventId);
    await wait(this.latencyMs, signal);
    if (!summary) return null;
    const today = this.today();
    const store = new LocalPlanStore(stubPlan(summary, today), today);
    const workspace: Workspace = {
      store,
      review: store,
      manage: null,
      today,
      ai: new RecordedAiClient(RECORDING_SAMPLE[summary.details.eventType], () => store.getPlan(), today),
      createProposal: localProposals(store, today),
    };
    this.opened.set(eventId, workspace);
    return workspace;
  }
}
