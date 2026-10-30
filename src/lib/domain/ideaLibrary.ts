import { z } from "zod";
import library from "./ideaLibrary.json";
import { COST_BASES, EFFORTS, IDEA_CATEGORIES, OCCASIONS, type IdeaCategory } from "./model/enums";
import type { EventDoc, IdeaFields } from "./model/event";
import { normaliseTitle } from "./ops/context";
import { seasonOf } from "./personalisation";
import { EVENT_TYPES } from "./schemas";

/**
 * Utsav's curated idea library (spec 6.5 fallback, section 7): about 40 ideas tagged by event type,
 * occasion, age band, tradition, interest keywords, functions and guest mix. When AI ideas are
 * unavailable, `libraryIdeas` picks the best matches for the plan by the same personalisation
 * rules, with a `basis` that says which inputs matched ("Why this idea").
 */

const tags = z.object({
  /** Required: the idea suits only these event types. */
  types: z.array(z.enum(EVENT_TYPES)).readonly().optional(),
  /** Required: only for these occasions. */
  occasions: z.array(z.enum(OCCASIONS)).readonly().optional(),
  /** Required: only when one of these traditions is selected (7.3: rituals only when chosen). */
  traditions: z.array(z.string()).readonly().optional(),
  /** Required: an honoree's age (or a birthday milestone) in this range. */
  ages: z.tuple([z.number(), z.number()]).readonly().optional(),
  /** Required: a function whose name contains one of these words. */
  functions: z.array(z.string()).readonly().optional(),
  /** Preferred: honoree interests containing one of these words. */
  interests: z.array(z.string()).readonly().optional(),
  /** Preferred: kids or elderly guests present. */
  kids: z.boolean().optional(),
  elderly: z.boolean().optional(),
  season: z.enum(["winter", "summer", "monsoon", "autumn"]).optional(),
});

const libraryIdea = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(IDEA_CATEGORIES),
  estimatedCost: z.number().int().nonnegative().nullable(),
  costBasis: z.enum(COST_BASES),
  effort: z.enum(EFFORTS),
  tags: tags,
});

type LibraryIdea = z.infer<typeof libraryIdea>;

/** The library itself is data (ideaLibrary.json), checked against this shape once when the module loads. */
export const IDEA_LIBRARY: readonly LibraryIdea[] = z.array(libraryIdea).parse(library);

/** Whose ages count: honorees' real ages, else a birthday's milestone (7.1). */
function agesOf(plan: EventDoc): number[] {
  const ages = plan.honorees.flatMap((h) => (h.age === null ? [] : [h.age]));
  return ages.length > 0 || plan.details.eventType !== "birthday" || plan.details.milestone === null ? ages : [plan.details.milestone];
}

interface Match {
  idea: LibraryIdea;
  score: number;
  basis: string[];
}

function match(entry: LibraryIdea, plan: EventDoc): Match | null {
  const { tags } = entry;
  const { details, guests } = plan;
  const basis: string[] = [];
  let score = 0;
  if (tags.types) {
    if (!tags.types.includes(details.eventType)) return null;
    basis.push("details.eventType");
    score += 1;
  }
  if (tags.occasions) {
    if (!details.occasion || !tags.occasions.includes(details.occasion)) return null;
    basis.push(`details.occasion:${details.occasion}`);
    score += 4;
  }
  if (tags.traditions) {
    const chosen = details.tradition.find((t) => tags.traditions?.includes(t));
    if (!chosen) return null;
    basis.push(`details.tradition:${chosen}`);
    score += 2;
  }
  if (tags.ages) {
    const [min, max] = tags.ages;
    if (!agesOf(plan).some((age) => age >= min && age <= max)) return null;
    basis.push("honoree.age");
    score += 2;
  }
  if (tags.functions) {
    if (!plan.functions.some((fn) => tags.functions?.some((word) => fn.name.toLowerCase().includes(word)))) return null;
    basis.push("functions");
    score += 2;
  }
  const interest = plan.honorees.flatMap((h) => h.interests).find((i) => tags.interests?.some((word) => i.toLowerCase().includes(word)));
  if (interest) {
    basis.push(`honoree.interests:${interest}`);
    score += 5;
  } else if (tags.interests && !tags.ages && !tags.types) return null;
  if (tags.kids && (guests.kids ?? 0) + (plan.flags.kids ? 1 : 0) > 0) {
    basis.push("guests.kids");
    score += 2;
  }
  if (tags.elderly && (guests.elderly ?? 0) + (plan.flags.elderly ? 1 : 0) > 0) {
    basis.push("guests.elderly");
    score += 2;
  }
  if (tags.season) {
    if (seasonOf(details.eventDate) !== tags.season) return null;
    basis.push("date.season");
    score += 1;
  }
  return { idea: entry, score, basis };
}

/**
 * Up to `limit` library ideas for the plan, best personal match first, skipping titles the plan
 * already has or the user dismissed. `focus` limits the categories when set.
 */
export function libraryIdeas(plan: EventDoc, focus: readonly IdeaCategory[] = [], limit = 6): IdeaFields[] {
  const taken = new Set([...plan.ideas.map((i) => normaliseTitle(i.title)), ...plan.dismissedIdeaTitles]);
  return IDEA_LIBRARY.flatMap((entry, index) => {
    if (taken.has(normaliseTitle(entry.title))) return [];
    if (focus.length > 0 && !focus.includes(entry.category)) return [];
    const found = match(entry, plan);
    return found ? [{ ...found, index }] : [];
  })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ idea, basis }) => ({
      title: idea.title,
      description: idea.description,
      category: idea.category,
      estimatedCost: idea.estimatedCost,
      costBasis: idea.costBasis,
      effort: idea.effort,
      basis,
    }));
}
