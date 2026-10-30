import type { ReactElement } from "react";
import { AiSessionProvider } from "@/components/ai/AiSession";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceContext";
import { DEMO_TABS, WORKSPACE_TABS, type WorkspaceTab } from "@/lib/client/workspace";
import { RecordedAiClient, type AiClient } from "@/lib/data/aiClient";
import { localProposals, type EventControls, type Workspace } from "@/lib/data/workspaces";
import { demoFixture } from "@/lib/demo/fixtures";
import type { DemoSample } from "@/lib/demo/resolveDates";
import type { EventDoc } from "@/lib/domain/model/event";
import { LocalPlanStore } from "@/lib/plan/LocalPlanStore";
import { SandboxPlanStore } from "@/lib/plan/SandboxPlanStore";
import { TODAY } from "../domainFixtures";
import { renderApp } from "./render";

export const NOW = "2026-10-28T06:00:00.000Z";

interface Options {
  /** The signed-in workspace (editable, `LocalPlanStore`) or the demo sandbox. */
  editable?: boolean;
  plan?: (plan: EventDoc) => EventDoc;
  ai?: Partial<AiClient>;
  manage?: EventControls | null;
}

/** A workspace over a demo sample with an instant recorded AI client. */
export function testWorkspace(
  sample: DemoSample = "wedding",
  { editable = true, plan = (p) => p, ai = {}, manage = null }: Options = {},
): Workspace {
  const doc = plan(demoFixture(sample, TODAY).event);
  const local = editable ? new LocalPlanStore(doc, TODAY) : null;
  const store = local ?? new SandboxPlanStore(doc, TODAY);
  const recorded = new RecordedAiClient(
    sample,
    () => store.getPlan(),
    TODAY,
    0,
    () => NOW,
  );
  const client: AiClient = {
    instruct: ai.instruct ?? recorded.instruct.bind(recorded),
    ideas: ai.ideas ?? recorded.ideas.bind(recorded),
    whatif: ai.whatif ?? recorded.whatif.bind(recorded),
    enquiry: ai.enquiry ?? recorded.enquiry.bind(recorded),
  };
  return { store, review: local, manage, today: TODAY, ai: client, createProposal: localProposals(store, TODAY, () => NOW) };
}

/** Renders `ui` inside the workspace providers, as the event and demo pages do. */
export function renderWorkspace(
  ui: ReactElement,
  {
    workspace = testWorkspace(),
    tab = "overview",
    prompt,
    sample,
  }: { workspace?: Workspace; tab?: WorkspaceTab; prompt?: string; sample?: DemoSample } = {},
) {
  const editable = workspace.store.mode === "server";
  return {
    workspace,
    ...renderApp(
      <WorkspaceProvider
        workspace={workspace}
        editable={editable}
        sample={sample}
        tab={tab}
        tabs={editable ? WORKSPACE_TABS : DEMO_TABS}
        tabHref={(t) => `/events/e1/${t}`}
      >
        <AiSessionProvider initialPrompt={prompt}>{ui}</AiSessionProvider>
      </WorkspaceProvider>,
    ),
  };
}
