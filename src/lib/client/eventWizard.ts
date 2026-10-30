import { daysBetween, formatWeekdayDate, weekdayName } from "@/lib/domain/dates";
import { FESTIVAL_DATES, FESTIVAL_LABELS, FESTIVAL_WINDOW_DAYS, type Festival } from "@/lib/domain/festivals";
import {
  createEventDateIssues,
  createEventRuleIssues,
  createEventSchema,
  type CreateEventInput,
  type FieldIssue,
  type PlanMode,
} from "@/lib/domain/model/createEvent";
import type { Dietary, Occasion, Tradition } from "@/lib/domain/model/enums";
import { isoDate, type Flags, type HonoreeDoc } from "@/lib/domain/model/event";
import type { UserProfile } from "@/lib/domain/model/user";
import { EVENT_TYPES, type EventType, type Language } from "@/lib/domain/schemas";
import { parseRupees } from "./money";

/**
 * The event creation wizard's form state (spec 5.1). Inputs stay strings while the user types;
 * `toCreateEventInput` converts them, and validation runs the same schema the server uses.
 */

export interface FunctionRow {
  key: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  share: string;
}

export interface HonoreeRow {
  key: string;
  role: HonoreeDoc["role"];
  name: string;
  age: string;
  gender: NonNullable<HonoreeDoc["gender"]> | "";
  interests: string[];
  notes: string;
}

export interface WizardForm {
  eventType: EventType;
  title: string;
  occasion: Occasion | "";
  occasionOther: string;
  milestone: string;
  eventDate: string;
  city: string;
  guests: string;
  budget: string;
  /** Non-wedding events have parts only when the user says so; weddings always list functions. */
  hasParts: boolean;
  functions: FunctionRow[];
  vibe: string;
  tradition: Tradition[];
  traditionOther: string;
  dietary: Dietary[];
  honorees: HonoreeRow[];
  theme: string;
  flags: Flags;
  language: Language;
}

export type WizardStep = 1 | 2 | 3;
export const WIZARD_STEPS: readonly { step: WizardStep; label: string }[] = [
  { step: 1, label: "Basics" },
  { step: 2, label: "Shape" },
  { step: 3, label: "Who it's for" },
];

export const WEDDING_FUNCTIONS = ["Haldi", "Mehndi", "Sangeet", "Wedding", "Reception"] as const;

const VIBE_PLACEHOLDERS: Record<EventType, string> = {
  wedding: "Pastel, lots of music, relaxed mornings",
  birthday: "Bright, playful, lots of colour",
  anniversary: "Warm, family photos, old songs",
  community: "Bright, family-friendly, lots of lights",
  other: "Intimate, simple, good food",
};

export const vibePlaceholder = (eventType: EventType) => VIBE_PLACEHOLDERS[eventType];

let rowCounter = 0;
/** A stable React key for a new row; not stored. */
export const newRowKey = (prefix: string) => `${prefix}-${++rowCounter}`;

export function functionRow(name = ""): FunctionRow {
  return { key: newRowKey("fn"), name, date: "", startTime: "", endTime: "", share: "" };
}

export function honoreeRow(eventType: EventType): HonoreeRow {
  const role: HonoreeRow["role"] =
    eventType === "birthday"
      ? "birthday_child"
      : eventType === "community"
        ? "community"
        : eventType === "anniversary"
          ? "couple"
          : "guest_of_honour";
  return { key: newRowKey("person"), role, name: "", age: "", gender: "", interests: [], notes: "" };
}

const shapeFor = (eventType: EventType) =>
  eventType === "wedding"
    ? { hasParts: true, functions: WEDDING_FUNCTIONS.map((n) => functionRow(n)) }
    : { hasParts: false, functions: [] };

/** A fresh form: city, traditions, dietary and language come from the profile; the type from `?type=`. */
export function newWizardForm(
  profile: Pick<UserProfile, "homeCity" | "traditions" | "traditionOther" | "dietary" | "language" | "eventTypes"> | null,
  prefill: { eventType?: EventType; occasion?: Occasion } = {},
): WizardForm {
  const eventType = prefill.eventType ?? profile?.eventTypes[0] ?? "wedding";
  return {
    eventType,
    title: "",
    occasion: prefill.occasion && (eventType === "community" || eventType === "other") ? prefill.occasion : "",
    occasionOther: "",
    milestone: "",
    eventDate: "",
    city: profile?.homeCity ?? "",
    guests: "",
    budget: "",
    ...shapeFor(eventType),
    vibe: "",
    tradition: profile?.traditions.filter((t) => t !== "undisclosed") ?? [],
    traditionOther: profile?.traditionOther ?? "",
    dietary: profile?.dietary ?? [],
    honorees: [],
    theme: "",
    flags: { kids: false, elderly: false, mobility: false },
    language: profile?.language ?? "en",
  };
}

/** Switching type resets the fields that belong to the old type (milestone, occasion, default functions). */
export function changeEventType(form: WizardForm, eventType: EventType): WizardForm {
  if (eventType === form.eventType) return form;
  return { ...form, eventType, milestone: "", occasion: "", occasionOther: "", ...shapeFor(eventType) };
}

/** Event types in the order the profile lists them first (spec 5.1). */
export function orderedEventTypes(preferred: readonly EventType[]): EventType[] {
  return [...preferred, ...EVENT_TYPES.filter((t) => !preferred.includes(t))];
}

const optionalNumber = (text: string): number | null => (text.trim() === "" ? null : Number(text));
const requiredNumber = (text: string): number => (text.trim() === "" ? Number.NaN : Number(text));
const optionalText = (text: string): string | null => text || null;

export function toCreateEventInput(form: WizardForm, mode: PlanMode): CreateEventInput {
  const hasMilestone = form.eventType === "birthday" || form.eventType === "anniversary";
  const hasOccasion = form.eventType === "community" || form.eventType === "other";
  const occasion = hasOccasion && form.occasion ? form.occasion : null;
  return {
    mode,
    eventType: form.eventType,
    title: form.title,
    occasion,
    occasionOther: occasion === "other" ? form.occasionOther : "",
    milestone: hasMilestone ? optionalNumber(form.milestone) : null,
    eventDate: form.eventDate,
    city: form.city,
    guestCount: requiredNumber(form.guests),
    budget: parseRupees(form.budget) ?? Number.NaN,
    functions: form.hasParts
      ? form.functions.map((f) => ({
          name: f.name,
          date: optionalText(f.date),
          startTime: optionalText(f.startTime),
          endTime: optionalText(f.endTime),
          sharePercent: optionalNumber(f.share),
        }))
      : [],
    vibe: form.vibe,
    theme: form.theme,
    tradition: form.tradition,
    traditionOther: form.tradition.includes("mixed_other") ? form.traditionOther : "",
    dietary: form.dietary,
    honorees: form.honorees.map((h) => ({
      role: h.role,
      name: h.name,
      age: optionalNumber(h.age),
      gender: h.gender || null,
      interests: h.interests,
      notes: h.notes,
    })),
    flags: form.flags,
    language: form.language,
  };
}

/** Top-level fields each step owns, so Next only reports the step's own problems. */
const STEP_FIELDS: Record<WizardStep, readonly string[]> = {
  1: ["eventType", "title", "occasion", "occasionOther", "milestone", "eventDate", "city", "guestCount", "budget"],
  2: ["functions", "vibe", "tradition", "traditionOther", "dietary"],
  3: ["honorees", "theme", "flags", "language"],
};

/** A problem the wizard shows inline and in the error summary. `id` is the field to focus. */
export interface WizardIssue {
  id: string;
  label: string;
  message: string;
}

/** The DOM id of the control for a schema path, e.g. ["functions", 2, "date"] -> "event-functions-2-date". */
export const fieldId = (path: readonly (string | number)[]) => ["event", ...path].join("-");

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  occasion: "Occasion",
  occasionOther: "Occasion",
  eventDate: "Event date",
  city: "City",
  guestCount: "Guests",
  budget: "Total budget",
  functions: "Shares",
  vibe: "Vibe",
  traditionOther: "Traditions, Mixed/other",
  theme: "Theme",
  name: "name",
  date: "date",
  startTime: "start time",
  endTime: "end time",
  sharePercent: "share",
  age: "age",
  notes: "notes",
  interests: "interests",
};

function issueLabel(path: readonly (string | number)[], form: WizardForm): string {
  const [head, index, leaf] = path;
  if (head === "milestone") return form.eventType === "birthday" ? "Turning (age)" : "Years married";
  if (head === "functions" && typeof index === "number" && typeof leaf === "string") {
    const name = form.functions[index]?.name.trim() || `${form.eventType === "wedding" ? "Function" : "Part"} ${index + 1}`;
    return `${name} ${FIELD_LABELS[leaf] ?? leaf}`;
  }
  if (head === "honorees" && typeof index === "number" && typeof leaf === "string") {
    return `Person ${index + 1} ${FIELD_LABELS[leaf] ?? leaf}`;
  }
  return FIELD_LABELS[String(head)] ?? String(head);
}

/**
 * Problems for one step, or for every step when `step` is omitted. Messages come from the shared
 * schema (`createEventSchema`), its cross-field rules and the date rules that need today.
 */
export function wizardIssues(form: WizardForm, today: string, step?: WizardStep): WizardIssue[] {
  const input = toCreateEventInput(form, "ai");
  const parsed = createEventSchema.safeParse(input);
  const schemaIssues: FieldIssue[] = parsed.success
    ? []
    : parsed.error.issues.map((i) => ({ path: i.path.filter((p): p is string | number => typeof p !== "symbol"), message: i.message }));
  const all = [...schemaIssues, ...createEventRuleIssues(input), ...createEventDateIssues(input, today)];
  const fields = step ? STEP_FIELDS[step] : Object.values(STEP_FIELDS).flat();
  const seen = new Set<string>();
  return all.flatMap((issue) => {
    const id = fieldId(issue.path);
    if (!fields.includes(String(issue.path[0])) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label: issueLabel(issue.path, form), message: issue.message }];
  });
}

/** The first step with a problem, so a final submit can send the user back to it. */
export function firstStepWithIssues(form: WizardForm, today: string): WizardStep | null {
  return WIZARD_STEPS.find(({ step }) => wizardIssues(form, today, step).length > 0)?.step ?? null;
}

/** "Monday · 47 days from today" under the date field. */
export function eventDateHelper(eventDate: string, today: string): string | null {
  if (!isoDate.safeParse(eventDate).success) return null;
  const days = daysBetween(today, eventDate);
  const when = days === 0 ? "today" : days === 1 ? "tomorrow" : days > 0 ? `${days} days from today` : `${-days} days ago`;
  return `${weekdayName(eventDate, "long")} · ${when}`;
}

const OCCASION_FESTIVALS: Partial<Record<Occasion, readonly Festival[]>> = {
  diwali: ["diwali"],
  holi: ["holi"],
  navratri: ["navratri"],
  ganesh_chaturthi: ["ganesh_chaturthi"],
  eid: ["eid_al_fitr", "eid_al_adha"],
  christmas: ["christmas"],
  independence_day: ["independence_day"],
  republic_day: ["republic_day"],
};

/**
 * Where the chosen festival falls relative to the event date, from Utsav's festival table, e.g.
 * "Diwali is on Sun 8 Nov 2026, 2 days after your date." Null when nothing is within 10 days.
 */
export function festivalNote(occasion: Occasion | "", eventDate: string): string | null {
  const festivals = occasion ? OCCASION_FESTIVALS[occasion] : undefined;
  if (!festivals || !isoDate.safeParse(eventDate).success) return null;
  const nearest = festivals
    .flatMap((festival) => FESTIVAL_DATES[festival].map((date) => ({ festival, date, days: daysBetween(eventDate, date) })))
    .filter((f) => Math.abs(f.days) <= FESTIVAL_WINDOW_DAYS)
    .sort((a, b) => Math.abs(a.days) - Math.abs(b.days))[0];
  if (!nearest) return null;
  const n = Math.abs(nearest.days);
  const relation =
    nearest.days === 0
      ? "the same day as your date"
      : `${n} ${n === 1 ? "day" : "days"} ${nearest.days > 0 ? "after" : "before"} your date`;
  return `${FESTIVAL_LABELS[nearest.festival]} is on ${formatWeekdayDate(nearest.date)}, ${relation}.`;
}
