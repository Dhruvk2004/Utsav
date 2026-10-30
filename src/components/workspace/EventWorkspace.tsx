"use client";

import { ClipboardCheck, Settings } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { use, useCallback, useState, type ReactNode } from "react";
import { AiSessionProvider } from "@/components/ai/AiSession";
import { useServices } from "@/components/data/ServicesProvider";
import { useAsync } from "@/components/data/useAsync";
import { ErrorPanel, errorReference } from "@/components/system/ErrorPanel";
import { NotFound } from "@/components/system/NotFound";
import { reviewPending } from "@/lib/client/review";
import type { MenuItem } from "@/components/ui/Menu";
import { eventSettingsHref, parseTab, WORKSPACE_TABS, workspaceTabHref, type WorkspaceTab } from "@/lib/client/workspace";
import type { Workspace } from "@/lib/data/workspaces";
import { useWorkspace, WorkspaceProvider } from "./WorkspaceContext";
import { WorkspaceFrame } from "./WorkspaceFrame";
import { WorkspaceSkeleton } from "./WorkspaceSkeleton";
import { ReviewVisibility } from "./WorkspaceTabView";

/** `?ai=open` opens AI mode; any other value also pre-fills the instruction (spec 3.1). */
export function initialPrompt(ai: string | null): string | undefined {
  if (ai === null) return undefined;
  return ai === "open" ? "" : ai.slice(0, 500);
}

function Frame({ eventId, children }: { eventId: string; children: ReactNode }) {
  const { plan, workspace } = useWorkspace();
  const [dismissed, setDismissed] = useState(false);
  const canReopen = dismissed && workspace.review !== null && reviewPending(plan);
  const menuItems: MenuItem[] = [
    ...(canReopen
      ? [
          {
            kind: "action" as const,
            label: "Review your new plan",
            icon: <ClipboardCheck size={16} aria-hidden="true" />,
            onSelect: () => setDismissed(false),
          },
        ]
      : []),
    {
      kind: "link",
      label: "Event settings, share and calendar",
      href: eventSettingsHref(eventId),
      icon: <Settings size={16} aria-hidden="true" />,
    },
  ];
  return (
    <ReviewVisibility.Provider value={{ dismissed, setDismissed }}>
      <WorkspaceFrame menuItems={menuItems}>{children}</WorkspaceFrame>
    </ReviewVisibility.Provider>
  );
}

function Loaded({
  eventId,
  workspace,
  tab,
  onSettings,
  children,
}: {
  eventId: string;
  workspace: Workspace;
  tab: WorkspaceTab;
  onSettings: boolean;
  children: ReactNode;
}) {
  const params = useSearchParams();
  const tabHref = useCallback((t: WorkspaceTab) => workspaceTabHref(eventId, t), [eventId]);
  return (
    <WorkspaceProvider workspace={workspace} editable tab={tab} onSettings={onSettings} tabs={WORKSPACE_TABS} tabHref={tabHref}>
      <AiSessionProvider initialPrompt={initialPrompt(params.get("ai"))}>
        <Frame eventId={eventId}>{children}</Frame>
      </AiSessionProvider>
    </WorkspaceProvider>
  );
}

/**
 * The signed-in workspace (spec 5.2): loads the event through the workspace repository and
 * renders the shared workspace around the current tab route. Unknown events show the 404 page.
 */
export function EventWorkspace({ params, children }: { params: Promise<{ id: string }>; children: ReactNode }) {
  const { id } = use(params);
  const pathname = usePathname();
  const segment = pathname.split("/")[3];
  const tab = parseTab(segment, WORKSPACE_TABS, "overview");
  const { workspaces } = useServices();
  const load = useCallback((signal: AbortSignal) => workspaces.open(id, signal), [workspaces, id]);
  const { state, retry } = useAsync(load);

  if (state.status === "loading") return <WorkspaceSkeleton />;
  if (state.status === "error") return <ErrorPanel reference={errorReference(state.error)} onRetry={retry} />;
  if (!state.data) return <NotFound />;
  return (
    <Loaded eventId={id} workspace={state.data} tab={tab} onSettings={segment === "settings"}>
      {children}
    </Loaded>
  );
}
