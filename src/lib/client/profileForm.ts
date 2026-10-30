import type { Tradition } from "@/lib/domain/model/enums";
import { MAX_TRADITIONS } from "@/lib/domain/model/user";
import { cleanText } from "@/lib/domain/schemas";

/** Adds `value` if absent, removes it if present. */
export function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Tradition chips: "Prefer not to say" excludes every other choice, and at most six can be chosen
 * (the stored cap). A seventh pick leaves the list unchanged.
 */
export function toggleTradition(list: readonly Tradition[], value: Tradition): Tradition[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  if (value === "undisclosed") return ["undisclosed"];
  const rest = list.filter((v) => v !== "undisclosed");
  return rest.length >= MAX_TRADITIONS ? [...list] : [...rest, value];
}

export interface ProfileFieldValues {
  displayName: string;
  homeCity: string;
  traditions: readonly Tradition[];
  traditionOther: string;
}

const TOO_LONG = "Use 60 characters or fewer.";

/** Inline messages for the profile text fields, keyed by field name; empty when everything is valid. */
export function profileFieldErrors(values: Partial<ProfileFieldValues>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (values.displayName !== undefined) {
    const name = cleanText(values.displayName);
    if (!name) errors.displayName = "Enter your name.";
    else if (name.length > 60) errors.displayName = TOO_LONG;
  }
  if (values.homeCity !== undefined) {
    const city = cleanText(values.homeCity);
    if (city.length < 2) errors.homeCity = "Enter your city.";
    else if (city.length > 60) errors.homeCity = TOO_LONG;
  }
  if (values.traditions?.includes("mixed_other") && cleanText(values.traditionOther ?? "").length > 60) {
    errors.traditionOther = TOO_LONG;
  }
  return errors;
}
