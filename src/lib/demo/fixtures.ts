import { todayInIndia } from "@/lib/domain/dates";
import type { EventDoc } from "@/lib/domain/model/event";
import type { PlanProfile } from "@/lib/domain/model/user";
import { finalizePlan } from "@/lib/domain/ops/apply";
import type { DemoClock } from "./build";
import { resolveEventDate, type DemoSample } from "./resolveDates";
import { birthdayProfile, buildBirthday } from "./samples/birthday";
import { buildCommunity, communityProfile } from "./samples/community";
import { buildWedding, weddingProfile } from "./samples/wedding";

/** A public demo sample: a complete stored-shape event and the minimal profile that feeds AI context. */
export interface DemoFixture {
  event: EventDoc;
  profile: PlanProfile;
}

const SAMPLES: Record<DemoSample, { build: (clock: DemoClock) => EventDoc; profile: PlanProfile }> = {
  wedding: { build: buildWedding, profile: weddingProfile },
  birthday: { build: buildBirthday, profile: birthdayProfile },
  community: { build: buildCommunity, profile: communityProfile },
};

/**
 * The pristine sample for `today`. Dates are resolved first, then the same `finalizePlan` the
 * op applier uses derives percents, function amounts, flags, stats and warnings.
 */
export function demoFixture(sample: DemoSample, today: string = todayInIndia()): DemoFixture {
  return { event: sampleEvent(sample, { eventDate: resolveEventDate(sample, today), today }), profile: SAMPLES[sample].profile };
}

/** A sample's content on any event date (the stub workspace reuses it for its seeded events). */
export function sampleEvent(sample: DemoSample, clock: DemoClock): EventDoc {
  return finalizePlan(SAMPLES[sample].build(clock), clock.today);
}
