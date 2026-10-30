"use client";

import { CalendarHeart, ChevronDown, Info, LogOut, Pencil } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { Logo } from "@/components/brand/Logo";
import { useServices } from "@/components/data/ServicesProvider";
import { useAsync } from "@/components/data/useAsync";
import { cx } from "@/components/ui/cx";
import { MenuButton } from "@/components/ui/Menu";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "./Avatar";

/** Signed-in header (spec 3.2): logo to My events, the "My events" link and the account menu. */
export function AppHeader() {
  const pathname = usePathname();
  return <AppHeaderBar onEvents={pathname === "/dashboard" || pathname.startsWith("/events")} />;
}

/** The header itself; also the fallback while a dynamic route's path streams in. */
export function AppHeaderBar({ onEvents }: { onEvents: boolean }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-sm">
          <Logo className="h-7 w-auto" />
        </Link>
        <nav aria-label="Main" className="ml-1 flex gap-1 sm:ml-3">
          <Link
            href="/dashboard"
            aria-current={onEvents ? "page" : undefined}
            className={cx(
              "inline-flex min-h-11 items-center rounded-sm px-3 text-body-sm font-semibold no-underline",
              onEvents ? "bg-surface-sunken text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            My events
          </Link>
        </nav>
        <span className="flex-1" />
        <AccountMenu />
      </div>
    </header>
  );
}

/** Avatar menu: name and email, My events, Settings, Privacy and AI, Sign out (design.html, Settings). */
export function AccountMenu() {
  const { profiles, auth } = useServices();
  const router = useRouter();
  const load = useCallback((signal: AbortSignal) => profiles.load(signal), [profiles]);
  const { state } = useAsync(load);

  if (state.status !== "ready") {
    return state.status === "loading" ? <Skeleton className="size-9 rounded-full" /> : null;
  }
  const { displayName, email, photoURL } = state.data;
  const firstName = displayName.split(" ")[0] || displayName;
  return (
    <MenuButton
      menuLabel="Account menu"
      triggerClassName="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border-0 bg-transparent px-1 text-body-sm font-semibold text-fg"
      trigger={
        <>
          <Avatar name={displayName} photoURL={photoURL} />
          <span className="max-sm:sr-only">{firstName}</span>
          <span className="sr-only">, account menu</span>
          <ChevronDown size={16} aria-hidden="true" />
        </>
      }
      header={
        <>
          <b className="text-body-sm">{displayName}</b>
          <span className="text-caption text-fg-muted">{email}</span>
        </>
      }
      items={[
        { kind: "link", label: "My events", href: "/dashboard", icon: <CalendarHeart size={16} aria-hidden="true" /> },
        { kind: "link", label: "Settings", href: "/settings", icon: <Pencil size={16} aria-hidden="true" /> },
        { kind: "link", label: "Privacy and AI", href: "/privacy", icon: <Info size={16} aria-hidden="true" /> },
        {
          kind: "action",
          label: "Sign out",
          icon: <LogOut size={16} aria-hidden="true" />,
          onSelect: () => void auth.signOut().then(() => router.push("/")),
        },
      ]}
    />
  );
}
