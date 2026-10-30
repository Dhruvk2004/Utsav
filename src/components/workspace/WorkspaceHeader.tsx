"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useAiSession } from "@/components/ai/AiSession";
import { EVENT_TYPE_ICONS } from "@/components/dashboard/EventCard";
import { buttonClasses } from "@/components/ui/Button";
import { OriginTag, Tag } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { FlameIcon } from "@/components/ui/icons";
import { MenuButton, type MenuItem } from "@/components/ui/Menu";
import { activeVendorCount, DEMO_TITLES, headerMeta, TAB_LABELS } from "@/lib/client/workspace";
import { EVENT_TYPE_LABELS } from "@/lib/domain/labels";
import { LinkTabs } from "@/components/ui/Tabs";
import { useWorkspace } from "./WorkspaceContext";

const noop = () => () => {};
const isApple = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

/** "Ctrl K" by default and "⌘K" on Apple platforms (design-system 6.15). */
function ShortcutHint() {
  const apple = useSyncExternalStore(noop, isApple, () => false);
  return (
    <kbd
      aria-hidden="true"
      className="rounded-sm border border-[color:color-mix(in_srgb,var(--color-hero-fg)_40%,transparent)] px-1.5 py-0.5 font-sans text-[11px] pointer-coarse:hidden"
    >
      {apple ? "⌘K" : "Ctrl K"}
    </kbd>
  );
}

/**
 * The AI mode button (design-system 6.15): "AI mode" first in its name, the shortcut exposed
 * with aria-keyshortcuts, the waiting count as visually hidden text. Focus returns here when
 * the panel closes.
 */
function AiModeButton() {
  const { sample } = useWorkspace();
  const { panelOpen, openPanel, pendingCount } = useAiSession();
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(panelOpen);

  useEffect(() => {
    if (wasOpen.current && !panelOpen) button.current?.focus();
    wasOpen.current = panelOpen;
  }, [panelOpen]);

  return (
    <button
      ref={button}
      type="button"
      aria-keyshortcuts="Control+K Meta+K"
      aria-expanded={panelOpen}
      onClick={() => openPanel()}
      className="relative inline-flex min-h-11 items-center gap-2 rounded-md bg-hero-bg px-4 text-body-sm font-semibold text-hero-fg"
    >
      <FlameIcon className="text-accent" />
      {sample ? "Try AI mode" : "AI mode"}
      <ShortcutHint />
      {pendingCount > 0 && !panelOpen && (
        <>
          <span
            aria-hidden="true"
            className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-accent text-[11px] text-on-accent"
          >
            {pendingCount}
          </span>
          <span className="sr-only">, {pendingCount} suggestions waiting</span>
        </>
      )}
    </button>
  );
}

/** Workspace header (spec 5.2): title, chips, date with countdown, city, guests, budget, AI mode and the event menu. */
export function WorkspaceHeader({ menuItems }: { menuItems: MenuItem[] }) {
  const { plan, view, today, sample, tab, onSettings, tabs, tabHref } = useWorkspace();
  const meta = headerMeta(plan, view, today);
  const title = sample ? DEMO_TITLES[sample] : meta.title;
  const tabsRef = useRef<HTMLDivElement>(null);

  // The current tab scrolls into view on phones, without smooth scrolling (design-system 6.9).
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [tab]);

  const vendorCount = activeVendorCount(plan);
  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-2 px-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="m-0 font-display text-[1.75rem] leading-tight font-semibold sm:text-[2rem]">{title}</h1>
            <Tag tone="type" icon={EVENT_TYPE_ICONS[plan.details.eventType]}>
              {EVENT_TYPE_LABELS[plan.details.eventType]}
            </Tag>
            {sample ? (
              <Tag tone="warning">Sample plan</Tag>
            ) : plan.source === "template" ? (
              <OriginTag origin="template" />
            ) : plan.source === "ai" ? (
              <OriginTag origin="ai">AI plan</OriginTag>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <AiModeButton />
            {menuItems.length > 0 && (
              <MenuButton
                menuLabel="Event menu"
                triggerClassName={buttonClasses({ variant: "secondary", iconOnly: true })}
                trigger={
                  <>
                    <MoreHorizontal size={20} aria-hidden="true" />
                    <span className="sr-only">Event menu</span>
                  </>
                }
                items={menuItems}
              />
            )}
          </div>
        </div>
        <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-fg-muted">
          <span>
            <b className="text-fg">{meta.date}</b> · {meta.countdown}
            {meta.festival && ` · ${meta.festival}`}
          </span>
          <span>{meta.city}</span>
          <span>{meta.guests}</span>
          <span className="num">{meta.budget}</span>
        </p>
        <div ref={tabsRef} className={cx("relative -mx-4 sm:mx-0")}>
          <LinkTabs
            label={sample ? "Sample sections" : "Event sections"}
            className="scroll-px-4 border-b-0 px-4 pr-9 [scroll-snap-type:x_proximity] sm:px-0"
            tabs={tabs.map((t) => ({
              href: tabHref(t),
              label: TAB_LABELS[t],
              current: t === tab && !onSettings,
              ...(t === "vendors" ? { count: vendorCount, countLabel: "active" } : {}),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
