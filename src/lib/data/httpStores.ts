import { z } from "zod";
import { type CreateEventRequest } from "@/lib/domain/model/createEvent";
import { eventDocSchema } from "@/lib/domain/model/event";
import { PLAN_SOURCES } from "@/lib/domain/model/enums";
import { userDocSchema, type ProfilePatch, type UserProfile } from "@/lib/domain/model/user";
import { Api } from "./api";
import type { CreatedEvent, EventSummary, EventsRepository } from "./eventsRepository";
import type { ProfileStore } from "./profileStore";

/** `ProfileStore` and `EventsRepository` over `/api/profile` and `/api/events` (spec 12.1). */

const profileSchema = z.object({ profile: userDocSchema.omit({ createdAt: true, updatedAt: true }) });

export class HttpProfileStore implements ProfileStore {
  constructor(private readonly api = new Api()) {}

  async load(signal?: AbortSignal): Promise<UserProfile> {
    return (await this.api.request("/api/profile", profileSchema, { signal })).profile;
  }

  async save(patch: ProfilePatch, signal?: AbortSignal): Promise<UserProfile> {
    return (await this.api.request("/api/profile", profileSchema, { method: "PUT", body: patch, signal })).profile;
  }
}

const summarySchema = eventDocSchema
  .pick({ details: true, status: true, source: true, stats: true })
  .extend({ id: z.string(), guests: z.number(), budgetTotal: z.number() });
const listSchema = z.object({ events: z.array(summarySchema) });
const createdSchema = z.object({ eventId: z.string(), source: z.enum(PLAN_SOURCES) });

export class HttpEventsRepository implements EventsRepository {
  constructor(private readonly api = new Api()) {}

  async list(signal?: AbortSignal): Promise<EventSummary[]> {
    return (await this.api.request("/api/events", listSchema, { signal })).events;
  }

  create(request: CreateEventRequest, signal?: AbortSignal): Promise<CreatedEvent> {
    return this.api.request("/api/events", createdSchema, { method: "POST", body: request, signal });
  }
}
