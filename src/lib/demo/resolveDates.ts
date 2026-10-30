import { addDays } from "@/lib/domain/dates";
import { upcomingDates } from "@/lib/domain/festivals";

/**
 * Demo event dates are relative to today so the samples never go stale (spec 5.10). The
 * community Diwali sits two days before the next Diwali in the festival table that leaves at
 * least a week to plan; past the table it falls back to a plain date with no festival claim.
 */

export const DEMO_SAMPLES = ["wedding", "birthday", "community"] as const;
export type DemoSample = (typeof DEMO_SAMPLES)[number];

export const WEDDING_OFFSET_DAYS = 60;
export const BIRTHDAY_OFFSET_DAYS = 35;
export const COMMUNITY_FALLBACK_DAYS = 30;
export const DIWALI_LEAD_DAYS = 2;
export const MIN_PLANNING_DAYS = 7;

export function communityEventDate(today: string): string {
  const earliest = addDays(today, MIN_PLANNING_DAYS);
  const diwali = upcomingDates("diwali", today).find((day) => addDays(day, -DIWALI_LEAD_DAYS) >= earliest);
  return diwali ? addDays(diwali, -DIWALI_LEAD_DAYS) : addDays(today, COMMUNITY_FALLBACK_DAYS);
}

export function resolveEventDate(sample: DemoSample, today: string): string {
  if (sample === "wedding") return addDays(today, WEDDING_OFFSET_DAYS);
  if (sample === "birthday") return addDays(today, BIRTHDAY_OFFSET_DAYS);
  return communityEventDate(today);
}
