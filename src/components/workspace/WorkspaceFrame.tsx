"use client";

import { WifiOff } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { AiPanel } from "@/components/ai/AiPanel";
import { useAiSession } from "@/components/ai/AiSession";
import type { MenuItem } from "@/components/ui/Menu";
import { OFFLINE_MESSAGE, useWorkspace } from "./WorkspaceContext";
import { WorkspaceHeader } from "./WorkspaceHeader";

/** "You are offline" (spec 3.4, design-system page banners): sticky, warning tint, announced politely. */
function OfflineBanner() {
  return (
    <div role="status" className="sticky top-0 z-20 border-b border-line bg-warning-tint">
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2.5 text-body-sm sm:px-6">
        <WifiOff size={18} className="shrink-0 text-warning" aria-hidden="true" />
        <b>{OFFLINE_MESSAGE}</b>
      </div>
    </div>
  );
}

/**
 * The workspace page: header and tabs, the tab content, and AI mode beside it from 1024 px
 * (it pushes the content) or over it as a sheet below. Ctrl+K / Cmd+K opens AI mode and puts
 * the cursor in the instruction box (a modified shortcut, WCAG 2.1.4).
 */
export function WorkspaceFrame({
  menuItems,
  banner,
  onReset,
  children,
}: {
  menuItems: MenuItem[];
  banner?: ReactNode;
  onReset?: () => void;
  children: ReactNode;
}) {
  const { openPanel, panelOpen } = useAiSession();
  const { offline } = useWorkspace();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (panelOpen) document.getElementById("ai-instruction")?.focus();
      else openPanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openPanel, panelOpen]);

  return (
    <>
      {offline && <OfflineBanner />}
      {banner}
      <div className="flex min-w-0 items-start">
        <div className="min-w-0 flex-1">
          <WorkspaceHeader menuItems={menuItems} />
          {/* Offline, every control in the tab is disabled; links still navigate (spec 3.4). */}
          <fieldset disabled={offline} className="contents">
            <div className="@container/workspace mx-auto max-w-[1200px] px-4 py-6 sm:px-6">{children}</div>
          </fieldset>
        </div>
        <AiPanel onReset={onReset} />
      </div>
    </>
  );
}
