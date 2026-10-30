import { z } from "zod";
import { EVENT_TYPES, freeText, LANGUAGES } from "../schemas";
import { BUDGET_STYLES, DETAIL_LEVELS, DIETARY, PROFILE_ROLES, TRADITIONS } from "./enums";
import { isoDate, isoDateTime } from "./event";

/** Stored profile (`users/{uid}`, spec 4.3 and 8.2). Nothing else is kept about a user. */
export const userDocSchema = z.object({
  displayName: z.string().max(60),
  photoURL: z.string().nullable(),
  email: z.string(),
  homeCity: z.string().max(60),
  language: z.enum(LANGUAGES),
  role: z.enum(PROFILE_ROLES).nullable(),
  eventTypes: z.array(z.enum(EVENT_TYPES)),
  traditions: z.array(z.enum(TRADITIONS)).max(6),
  traditionOther: z.string().max(60),
  dietary: z.array(z.enum(DIETARY)),
  budgetStyle: z.enum(BUDGET_STYLES).nullable(),
  detailLevel: z.enum(DETAIL_LEVELS),
  onboardedAt: isoDateTime.nullable(),
  aiUsage: z.object({ day: isoDate, count: z.number().int().min(0) }),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export type UserDoc = z.infer<typeof userDocSchema>;

/** The slice of a profile that shapes AI output; the demo supplies one per sample. */
export type PlanProfile = Pick<UserDoc, "role" | "budgetStyle" | "language">;

/** Profile as the app reads it; timestamps stay on the server. */
export type UserProfile = Omit<UserDoc, "createdAt" | "updatedAt">;

export const MAX_TRADITIONS = 6;

/**
 * Fields the user edits in onboarding and Settings. `PUT /api/profile` merges a partial patch
 * (spec 4.1, 12.1); `markOnboarded` sets `onboardedAt` once and never clears it (spec 3.3).
 */
export const profilePatchSchema = z
  .object({
    displayName: freeText(60).pipe(z.string().min(1, "Enter your name")),
    homeCity: freeText(60).pipe(z.string().min(2, "Enter your city")),
    language: z.enum(LANGUAGES),
    role: z.enum(PROFILE_ROLES).nullable(),
    eventTypes: z.array(z.enum(EVENT_TYPES)).max(EVENT_TYPES.length),
    traditions: z.array(z.enum(TRADITIONS)).max(MAX_TRADITIONS),
    traditionOther: freeText(60),
    dietary: z.array(z.enum(DIETARY)).max(DIETARY.length),
    budgetStyle: z.enum(BUDGET_STYLES).nullable(),
    detailLevel: z.enum(DETAIL_LEVELS),
    markOnboarded: z.literal(true),
  })
  .partial()
  .strict();

export type ProfilePatch = z.input<typeof profilePatchSchema>;

/** Merges a validated patch into a profile; `now` stamps `onboardedAt` the first time only. */
export function applyProfilePatch(profile: UserProfile, patch: ProfilePatch, now: string): UserProfile {
  const { markOnboarded, ...fields } = profilePatchSchema.parse(patch);
  return { ...profile, ...fields, onboardedAt: profile.onboardedAt ?? (markOnboarded ? now : null) };
}

/** Daily AI calls per user (spec 9.3), counted in `aiUsage`. */
export const AI_DAILY_QUOTA = 60;

/** AI calls used today; a counter from an earlier day reads as zero. */
export function aiUsedToday(profile: Pick<UserDoc, "aiUsage">, today: string): number {
  return profile.aiUsage.day === today ? profile.aiUsage.count : 0;
}
