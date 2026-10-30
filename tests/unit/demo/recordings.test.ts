import { describe, expect, it } from "vitest";
import { DEMO_RECORDED_CHIPS } from "@/lib/client/workspace";
import { WHATIF_RECORDINGS } from "@/lib/data/aiClient";
import { demoFixture } from "@/lib/demo/fixtures";
import {
  noRecordingDraft,
  pickInstructRecording,
  recordedInstructDraft,
  RECORDINGS,
  recordingDraft,
  recordingSchema,
} from "@/lib/demo/recordings";
import { DEMO_SAMPLES } from "@/lib/demo/resolveDates";
import { planInvariantViolations } from "@/lib/domain/invariants";
import { applyOperations } from "@/lib/domain/ops/apply";
import { buildProposal } from "@/lib/plan/proposals";
import { TODAY } from "../../domainFixtures";

const clock = { today: TODAY, now: "2026-10-28T06:00:00.000Z" };

describe("recorded demo proposals (spec 5.10)", () => {
  for (const sample of DEMO_SAMPLES) {
    const recordings = [...RECORDINGS[sample].instruct, RECORDINGS[sample].ideas];
    it.each(recordings.map((r) => [r.instruction || "ideas", r] as const))(
      `${sample}: %s applies to the pristine sample`,
      (_, recording) => {
        const pristine = demoFixture(sample, TODAY).event;
        for (const { op } of recording.items) {
          const outcome = applyOperations(pristine, [op], { today: TODAY, actor: "ai", proposalOrigin: "ai" });
          expect(outcome.results).toEqual([{ ok: true }]);
          expect(planInvariantViolations(outcome.plan)).toEqual([]);
        }
        const proposal = buildProposal(pristine, recordingDraft(recording, ""), clock);
        expect(proposal.items.every((item) => item.status === "pending")).toBe(true);
        expect(proposal.fallback).toBe(true);
      },
    );
  }

  it.each(DEMO_SAMPLES)(
    "%s: the chips offered with no live AI are exactly the recorded instructions, and each picks its recording (MQR-03)",
    (sample) => {
      expect(DEMO_RECORDED_CHIPS[sample]).toEqual(RECORDINGS[sample].instruct.map((recording) => recording.instruction));
      for (const chip of DEMO_RECORDED_CHIPS[sample]) expect(pickInstructRecording(sample, chip)?.instruction).toBe(chip);
    },
  );

  it("rejects recordings with unknown keys or non-proposable ops", () => {
    const base = { touchpoint: "instruct", instruction: "x", keywords: [] };
    expect(recordingSchema.safeParse({ ...base, items: [{ op: { type: "clear_dismissed_ideas" }, rationale: "" }] }).success).toBe(false);
    expect(recordingSchema.safeParse({ ...base, extra: 1, items: [] }).success).toBe(false);
  });

  it("picks the closest instruct recording by keyword, and none when no recording fits (MQW-08 regression)", () => {
    expect(pickInstructRecording("wedding", "make that 15% instead")?.instruction).toBe("Make that 15% instead");
    expect(pickInstructRecording("wedding", "Cut decor spend by 20%")?.instruction).toBe("Cut decor spend by 20%");
    expect(pickInstructRecording("wedding", "Sangeet ka budget 50 hazaar badha do")).toBeNull();
    expect(pickInstructRecording("community", "anything")).toBeNull();
  });

  it("answers an uncovered instruction with a reply naming the recorded examples, and no cards (MQW-08 regression)", () => {
    const off = recordedInstructDraft("wedding", "Sangeet ka budget 50 hazaar badha do", "off");
    expect(off.items).toEqual([]);
    expect(off.reply).toBe(
      'Live AI isn\'t available in this demo, and recorded examples only cover "Cut decor spend by 20%" or "Make that 15% instead". Try one of those, or sign in to plan your own event.',
    );
    expect(noRecordingDraft("birthday", "x", "busy").reply).toMatch(
      /^Live AI is busy right now, and recorded examples only cover "Add a painting station"/,
    );
    expect(recordedInstructDraft("wedding", "cut decor", "busy").items).toEqual(RECORDINGS.wedding.instruct[0].items);
  });

  it("keeps the visitor's words as the batch instruction", () => {
    const recording = RECORDINGS.birthday.instruct[0];
    expect(recordingDraft(recording, "  paint stuff ").instruction).toBe("paint stuff");
    expect(recordingDraft(recording, " ").instruction).toBe("Add a painting station");
  });

  it("has a smart re-plan recording for the wedding only", () => {
    expect(WHATIF_RECORDINGS.wedding?.lines.length).toBeGreaterThan(0);
    expect(WHATIF_RECORDINGS.birthday).toBeUndefined();
  });
});
