import { formatCount, formatInr } from "@/lib/domain/budget";
import { estimateText } from "@/lib/domain/describe";
import { DIETARY_LABELS, OCCASION_LABELS, TRADITION_LABELS, ordinal } from "@/lib/domain/labels";
import type { Occasion, Tradition } from "@/lib/domain/model/enums";
import type { EventDoc, IdeaDoc, IdeaFields } from "@/lib/domain/model/event";
import { contingencyLine, nameKey } from "@/lib/domain/ops/context";
import { BASIS_INPUTS, dietaryWarning, seasonOf } from "@/lib/domain/personalisation";
import type { ProposalDraft } from "@/lib/plan/proposals";

/**
 * Ideas tab text built by code (spec 5.7, 6.5): the "Ideas use:" line, "Why this idea" from an
 * idea's structured `basis`, cost flags and the "Add to plan" code proposal.
 */

const tradition = (value: string) => TRADITION_LABELS[value as Tradition] ?? value;

function honoreePhrase(plan: EventDoc): string[] {
  const child = plan.honorees.find((h) => h.role === "birthday_child");
  if (!child) return [];
  const who = child.gender === "female" ? "birthday girl" : child.gender === "male" ? "birthday boy" : "birthday child";
  const interests = child.interests.length > 0 ? [`loves ${child.interests.join(", ")}`] : [];
  return [who, ...interests];
}

/** "turning 6 · birthday girl · loves cartoons, Peppa Pig, painting · Jain-friendly food · 25 kids". */
export function ideasUseSummary(plan: EventDoc): string {
  const { details, guests } = plan;
  const parts: string[] = [];
  if (details.occasion && details.occasion !== "other") parts.push(OCCASION_LABELS[details.occasion]);
  if (details.eventType === "community") parts.push("community event");
  if (details.milestone !== null)
    parts.push(details.eventType === "anniversary" ? `${ordinal(details.milestone)} anniversary` : `turning ${details.milestone}`);
  parts.push(...honoreePhrase(plan));
  if (details.theme) parts.push(`${details.theme} theme`);
  const people = [guests.kids ? `${guests.kids} kids` : "", guests.elderly ? `${guests.elderly} elderly` : ""].filter(Boolean).join(", ");
  if (people) parts.push(people);
  const traditions = details.tradition.filter((t) => t !== "mixed_other" && t !== "undisclosed").map(tradition);
  if (details.traditionOther) traditions.push(details.traditionOther.toLowerCase());
  if (traditions.length > 0) parts.push(traditions.join(" and "));
  if (details.dietary.length > 0)
    parts.push(details.dietary.map((d) => (d === "jain" ? "Jain-friendly food" : DIETARY_LABELS[d].toLowerCase())).join(", "));
  return parts.join(" · ");
}

function basisPhrase(entry: string, plan: EventDoc): string {
  const [key, value] = entry.split(":").map((part) => part.trim());
  const { details, guests } = plan;
  const child = plan.honorees.find((h) => h.role === "birthday_child");
  switch (key) {
    case "details.occasion":
      return OCCASION_LABELS[(value ?? details.occasion) as Occasion] ?? "the occasion";
    case "details.milestone":
      return details.milestone === null ? "the milestone" : `turning ${details.milestone}`;
    case "honoree.age":
      return child?.age != null ? `turning ${child.age}` : "their age";
    case "honoree.interests":
      return value ? `loves ${value}` : "their interests";
    case "guests.kids":
      return guests.kids ? `${guests.kids} kids` : "kids";
    case "guests.elderly":
      return guests.elderly ? `${guests.elderly} elderly guests` : "elderly guests";
    case "guests.total":
      return `${formatCount(guests.total)} guests`;
    case "profile.role":
      return value === "community" ? "community event" : "your role";
    case "details.tradition":
      return value ? tradition(value) : details.tradition.map(tradition).join(" and ");
    case "details.traditionOther":
      return details.traditionOther.toLowerCase() || "your traditions";
    case "details.dietary":
      return value === "jain" ? "Jain-friendly" : "dietary needs";
    case "details.theme":
      return details.theme ? `${details.theme} theme` : "theme";
    case "date.season":
      return seasonOf(details.eventDate);
    case "functions":
      return plan.functions.length > 0 ? `${plan.functions.length} functions` : "the event";
    default:
      return BASIS_INPUTS.find((input) => input.key === key)?.label ?? key;
  }
}

/** "Why this idea: Diwali, community event, 150 kids", or null when the idea has no basis. */
export function whyThisIdea(idea: Pick<IdeaFields, "basis">, plan: EventDoc): string | null {
  const phrases = [...new Set(idea.basis.map((entry) => basisPhrase(entry, plan)))];
  return phrases.length > 0 ? `Why this idea: ${phrases.join(", ")}` : null;
}

/** The cost line, always marked as an estimate. */
export function ideaCost(idea: Pick<IdeaFields, "estimatedCost" | "costBasis">): string | null {
  return idea.estimatedCost === null ? null : estimateText(idea.estimatedCost, idea.costBasis);
}

/** Flags shown on an idea card: over half the budget (spec 6.5) and the dietary guardrail (7.3). */
export function ideaFlags(
  idea: Pick<IdeaFields, "estimatedCost" | "costBasis" | "category" | "title" | "description">,
  plan: EventDoc,
): string[] {
  const perUnit =
    idea.costBasis === "per guest" ? plan.guests.total : idea.costBasis === "per kid" ? (plan.guests.kids ?? plan.guests.total) : 1;
  const cost = (idea.estimatedCost ?? 0) * perUnit;
  const flags = cost > plan.budget.total / 2 ? ["Above your budget"] : [];
  const dietary = dietaryWarning(idea, plan.details.dietary);
  return dietary ? [...flags, dietary] : flags;
}

const IDEA_LINE_HINTS: Record<IdeaFields["category"], string[]> = {
  decor: ["decor"],
  food: ["catering", "food"],
  activity: ["entertainment", "activit"],
  entertainment: ["entertainment", "sound"],
  ritual: ["ritual", "pandit"],
  favours: ["gift", "favour", "prize"],
  photo: ["photo"],
  experience: ["entertainment", "decor"],
};

/** "Add to plan" on a saved idea (spec 5.7): a task to arrange it and, when a line fits, a budget note. */
export function addToPlanDraft(plan: EventDoc, idea: IdeaDoc): ProposalDraft {
  const line =
    plan.budget.lines.find((l) => IDEA_LINE_HINTS[idea.category].some((hint) => nameKey(l.category).includes(hint))) ??
    contingencyLine(plan);
  const cost = idea.estimatedCost === null ? "" : ` (≈ ${formatInr(idea.estimatedCost)})`;
  const items: ProposalDraft["items"] = [
    {
      op: { type: "add_task", title: `Arrange: ${idea.title}`.slice(0, 120), category: line?.category ?? "General", daysBefore: 21 },
      rationale: "From your saved idea.",
    },
  ];
  if (line)
    items.push({
      op: {
        type: "set_budget_note",
        lineId: line.id,
        note: [line.note, `Idea: ${idea.title}${cost}`].filter(Boolean).join("; ").slice(0, 200),
      },
      rationale: "Keeps the idea's cost in view on its budget line.",
    });
  return { touchpoint: "add_to_plan", origin: "code", instruction: "", items };
}
