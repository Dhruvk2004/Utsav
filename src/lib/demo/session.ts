import { RecordedAiClient } from "@/lib/data/aiClient";
import { Api } from "@/lib/data/api";
import { SandboxAiClient } from "@/lib/data/httpAiClient";
import { localProposals, type Workspace } from "@/lib/data/workspaces";
import { SandboxPlanStore } from "@/lib/plan/SandboxPlanStore";
import { demoFixture } from "./fixtures";
import type { DemoSample } from "./resolveDates";

/**
 * A public demo session (spec 5.10): the pristine sample in a `SandboxPlanStore`, so nothing is
 * saved and a reload starts again. AI mode and ideas ask the demo routes (live, or recorded when
 * live AI is busy), sending the visitor's accepted ops; What-if and enquiry drafts stay recorded.
 */
export function demoWorkspace(
  sample: DemoSample,
  today: string,
  api = new Api(),
): Workspace & { store: SandboxPlanStore; ai: SandboxAiClient } {
  const store = new SandboxPlanStore(demoFixture(sample, today).event, today);
  return {
    store,
    review: null,
    manage: null,
    today,
    ai: new SandboxAiClient(sample, store, new RecordedAiClient(sample, () => store.getPlan(), today), api),
    createProposal: localProposals(store, today),
  };
}
