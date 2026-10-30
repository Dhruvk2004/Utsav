"use client";

import { Info, RotateCcw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AiSessionProvider, useAiSession } from "@/components/ai/AiSession";
import { useToday } from "@/components/data/useToday";
import { ButtonLink } from "@/components/ui/Button";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceContext";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { WorkspaceSkeleton } from "@/components/workspace/WorkspaceSkeleton";
import { WorkspaceTabView } from "@/components/workspace/WorkspaceTabView";
import { initialPrompt } from "@/components/workspace/EventWorkspace";
import { DEMO_DEFAULT_TAB, DEMO_TABS, demoTabHref, parseTab, type WorkspaceTab } from "@/lib/client/workspace";
import type { DemoSample } from "@/lib/demo/resolveDates";
import { demoWorkspace } from "@/lib/demo/session";

/** "Sample plan - not saved" (spec 10.19): a persistent note on every demo page. */
export function SampleBanner() {
  return (
    <div role="note" className="sticky top-0 z-20 border-b border-line bg-warning-tint">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-body-sm sm:px-6">
        <Info size={18} className="shrink-0 text-warning" aria-hidden="true" />
        <span className="flex-1">
          <b>Sample plan - not saved.</b> Changes reset when you reload.
        </span>
        <ButtonLink href="/signin" fullLoad size="sm">
          Create your own
        </ButtonLink>
      </div>
    </div>
  );
}

function SampleFrame({ onReset }: { onReset: () => void }) {
  const { clear } = useAiSession();
  const reset = useCallback(() => {
    onReset();
    clear();
  }, [onReset, clear]);
  const menuItems = [{ kind: "action" as const, label: "Reset sample", icon: <RotateCcw size={16} aria-hidden="true" />, onSelect: reset }];
  return (
    <WorkspaceFrame menuItems={menuItems} banner={<SampleBanner />} onReset={reset}>
      <WorkspaceTabView />
    </WorkspaceFrame>
  );
}

/**
 * A public sample (spec 5.10): the same workspace components, read-only except AI cards and the
 * sample What-if, over a sandbox that keeps every change in memory. Built once the client knows
 * today's date, so the sample's relative dates are always current.
 */
export function DemoWorkspace({ sample }: { sample: DemoSample }) {
  const today = useToday();
  const params = useSearchParams();
  const tab = parseTab(params.get("tab"), DEMO_TABS, DEMO_DEFAULT_TAB[sample]);
  const base = useMemo(() => (today ? demoWorkspace(sample, today) : null), [sample, today]);
  // With no live AI, AI mode offers only the recorded examples and says so up front (MQR-03).
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => {
    if (!base) return;
    const controller = new AbortController();
    void base.ai.liveAi(controller.signal).then((value) => {
      if (!controller.signal.aborted) setLive(value);
    });
    return () => controller.abort();
  }, [base]);
  const workspace = useMemo(() => (base && live !== null ? { ...base, aiAvailable: live } : base), [base, live]);
  const tabHref = useCallback((t: WorkspaceTab) => demoTabHref(sample, t), [sample]);
  const reset = useCallback(() => workspace?.store.reset(), [workspace]);

  if (!workspace) return <WorkspaceSkeleton label="Loading the sample plan" />;
  return (
    <WorkspaceProvider workspace={workspace} editable={false} sample={sample} tab={tab} tabs={DEMO_TABS} tabHref={tabHref}>
      <AiSessionProvider initialPrompt={initialPrompt(params.get("ai"))}>
        <SampleFrame onReset={reset} />
      </AiSessionProvider>
    </WorkspaceProvider>
  );
}
