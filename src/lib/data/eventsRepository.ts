import type { CreateEventRequest } from "@/lib/domain/model/createEvent";
import type { PLAN_SOURCES } from "@/lib/domain/model/enums";
import type { EventDetails, PlanStats } from "@/lib/domain/model/event";

export type PlanSource = (typeof PLAN_SOURCES)[number];

/**
 * One dashboard card: the projection the dashboard query reads (spec 9.3), never the embedded
 * arrays. `guests` and `source` are added to the spec's projection for the card's meta line and
 * its "Starter template" tag.
 */
export interface EventSummary {
  id: string;
  status: "active" | "archived";
  source: PlanSource;
  details: EventDetails;
  guests: number;
  budgetTotal: number;
  stats: PlanStats;
}

export interface CreatedEvent {
  eventId: string;
  /** "template" when AI was unavailable and the starter template was used instead (spec 5.1). */
  source: PlanSource;
}

/**
 * How the UI lists and creates events: `HttpEventsRepository` over `/api/events` in the app,
 * in-memory fixtures in tests (`tests/helpers/stubServices.ts`).
 */
export interface EventsRepository {
  list(signal?: AbortSignal): Promise<EventSummary[]>;
  create(request: CreateEventRequest, signal?: AbortSignal): Promise<CreatedEvent>;
}
