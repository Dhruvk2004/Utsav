import { z } from "zod";
import { proposableOperationSchema } from "@/lib/domain/ops/schema";
import type { ProposalDraft } from "@/lib/plan/proposals";
import birthdayIdeas from "./recorded/birthday-ideas.json";
import birthdayPainting from "./recorded/birthday-instruct-add-painting-station.json";
import communityIdeas from "./recorded/community-ideas.json";
import communityVolunteers from "./recorded/community-instruct-add-volunteer-tasks.json";
import weddingIdeas from "./recorded/wedding-ideas.json";
import weddingCutDecor from "./recorded/wedding-instruct-cut-decor-20.json";
import weddingFollowUp from "./recorded/wedding-instruct-follow-up-15.json";
import type { DemoSample } from "./resolveDates";

/**
 * Recorded proposals (spec 5.10): what the demo routes answer when live AI is busy or fails, and
 * what the recorded AI client returns in tests. Each is validated against the op schema here and
 * against its pristine sample in a unit test, so recordings never drift from the domain.
 */

export const recordingSchema = z.strictObject({
  touchpoint: z.enum(["instruct", "ideas"]),
  instruction: z.string().max(300),
  /** Words that pick this recording for an instruction (the closest example chip). */
  keywords: z.array(z.string()),
  items: z
    .array(z.strictObject({ op: proposableOperationSchema, rationale: z.string().max(160), dependsOn: z.array(z.string()).optional() }))
    .min(1)
    .max(10),
});
export type Recording = z.infer<typeof recordingSchema>;

const parse = (data: unknown) => recordingSchema.parse(data);

/** Per sample: instruct recordings (the first is the default) and the ideas recording. */
export const RECORDINGS: Record<DemoSample, { instruct: Recording[]; ideas: Recording }> = {
  wedding: { instruct: [parse(weddingCutDecor), parse(weddingFollowUp)], ideas: parse(weddingIdeas) },
  birthday: { instruct: [parse(birthdayPainting)], ideas: parse(birthdayIdeas) },
  community: { instruct: [parse(communityVolunteers)], ideas: parse(communityIdeas) },
};

function score(recording: Recording, text: string): number {
  const words = text.toLowerCase();
  return recording.keywords.filter((keyword) => words.includes(keyword)).length;
}

/**
 * The instruct recording whose keywords best match the instruction, or null when none does: a
 * recording that answers a different request would suggest the opposite of what was asked (MQW-08).
 */
export function pickInstructRecording(sample: DemoSample, instruction: string): Recording | null {
  const [first, ...rest] = RECORDINGS[sample].instruct;
  const best = rest.reduce((top, each) => (score(each, instruction) > score(top, instruction) ? each : top), first);
  return score(best, instruction) > 0 ? best : null;
}

/** Why an answer came from a recording: the live model was busy or failed, or this deployment has none. */
export type RecordedReason = "busy" | "off";

/**
 * The answer when no recording fits: a text reply naming the examples that do have recordings,
 * and no cards (MQW-08).
 */
export function noRecordingDraft(sample: DemoSample, instruction: string, reason: RecordedReason): ProposalDraft {
  const examples = RECORDINGS[sample].instruct.map((recording) => `"${recording.instruction}"`).join(" or ");
  const why = reason === "off" ? "Live AI isn't available in this demo" : "Live AI is busy right now";
  return {
    touchpoint: "instruct",
    origin: "ai",
    instruction: instruction.trim(),
    items: [],
    reply: `${why}, and recorded examples only cover ${examples}. Try one of those, or sign in to plan your own event.`.slice(0, 400),
    fallback: true,
    model: "recorded",
  };
}

/** The recorded answer to an instruction: the matching recording, or a reply saying what is covered. */
export function recordedInstructDraft(sample: DemoSample, instruction: string, reason: RecordedReason): ProposalDraft {
  const recording = pickInstructRecording(sample, instruction);
  return recording ? recordingDraft(recording, instruction) : noRecordingDraft(sample, instruction, reason);
}

/** A recording as a proposal draft; the visitor's own words stay the batch heading. */
export function recordingDraft(recording: Recording, instruction: string): ProposalDraft {
  return {
    touchpoint: recording.touchpoint,
    origin: "ai",
    instruction: instruction.trim() || recording.instruction,
    items: recording.items,
    fallback: true,
    model: "recorded",
  };
}
