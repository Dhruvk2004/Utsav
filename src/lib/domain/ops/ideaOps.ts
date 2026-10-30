import { CAPS, type EventDoc } from "../model/event";
import { defined, fail, findById, ideaSource, itemOrigin, normaliseTitle, uniqueId, type ApplyContext } from "./context";
import type { OpOf } from "./schema";

/** Idea ops (spec 5.7). AI and library ideas arrive through `add_idea` and are stored as saved. */

/** Appends a normalised title to `dismissedIdeaTitles`, keeping the newest 50. */
export function rememberDismissed(plan: EventDoc, title: string): void {
  const key = normaliseTitle(title);
  const rest = plan.dismissedIdeaTitles.filter((t) => t !== key);
  plan.dismissedIdeaTitles = [...rest, key].slice(-CAPS.dismissedIdeaTitles);
}

export function forgetDismissed(plan: EventDoc, title: string): void {
  const key = normaliseTitle(title);
  plan.dismissedIdeaTitles = plan.dismissedIdeaTitles.filter((t) => t !== key);
}

export function addIdea(plan: EventDoc, op: OpOf<"add_idea">, ctx: ApplyContext): void {
  if (plan.ideas.length >= CAPS.ideas) fail(`A plan can keep at most ${CAPS.ideas} ideas`);
  const key = normaliseTitle(op.idea.title);
  if (plan.ideas.some((idea) => normaliseTitle(idea.title) === key)) fail("You already have this idea");
  if (ctx.actor === "ai" && !ctx.edited && plan.dismissedIdeaTitles.includes(key)) {
    fail("You dismissed this idea earlier");
  }
  plan.ideas.push({
    ...op.idea,
    id: uniqueId(
      "idea",
      op.idea.title,
      plan.ideas.map((i) => i.id),
    ),
    state: "saved",
    origin: itemOrigin(ctx),
    source: ideaSource(ctx),
  });
}

export function updateIdea(plan: EventDoc, op: OpOf<"update_idea">, ctx: ApplyContext): void {
  const idea = findById(plan.ideas, op.ideaId, "Idea");
  const title = op.patch.title;
  if (title !== undefined && plan.ideas.some((i) => i.id !== idea.id && normaliseTitle(i.title) === normaliseTitle(title))) {
    fail("You already have this idea");
  }
  Object.assign(idea, defined(op.patch), { origin: itemOrigin(ctx) });
}

export function saveIdea(plan: EventDoc, op: OpOf<"save_idea">): void {
  const idea = findById(plan.ideas, op.ideaId, "Idea");
  if (idea.state === "saved") fail("This idea is already saved");
  idea.state = "saved";
}

export function removeIdea(plan: EventDoc, op: OpOf<"remove_idea">): void {
  const idea = findById(plan.ideas, op.ideaId, "Idea");
  if (op.dismiss) rememberDismissed(plan, idea.title);
  plan.ideas = plan.ideas.filter((i) => i.id !== idea.id);
}

export function clearDismissedIdeas(plan: EventDoc): void {
  plan.dismissedIdeaTitles = [];
}
