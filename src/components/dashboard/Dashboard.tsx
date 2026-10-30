"use client";

import { CalendarHeart, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useServices } from "@/components/data/ServicesProvider";
import { useAsync } from "@/components/data/useAsync";
import { useToday } from "@/components/data/useToday";
import { PageColumn } from "@/components/shell/Main";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";
import { LinkTabs } from "@/components/ui/Tabs";
import { eventCardView, splitEvents } from "@/lib/client/eventCard";
import { EventCard } from "./EventCard";

/** Prefilled starting points in the empty state (spec 10.4). */
const TRY_LINKS = [
  { label: "Wedding", href: "/events/new?type=wedding" },
  { label: "Kid's birthday", href: "/events/new?type=birthday" },
  { label: "Society Diwali", href: "/events/new?type=community&occasion=diwali" },
] as const;

/** My events (spec 10.4): upcoming and past tabs, cards, and the empty, loading and error states. */
export function Dashboard() {
  const { events } = useServices();
  const today = useToday();
  const showPast = useSearchParams().get("view") === "past";
  const load = useCallback((signal: AbortSignal) => events.list(signal), [events]);
  const { state, retry } = useAsync(load);

  return (
    <PageColumn className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 font-display text-h1 font-semibold sm:text-[2rem]">My events</h1>
        <ButtonLink href="/events/new" icon={<Plus size={16} aria-hidden="true" />}>
          New event
        </ButtonLink>
      </div>
      {state.status === "error" ? (
        <Alert
          tone="danger"
          title="Couldn't load your events."
          action={
            <Button variant="secondary" size="sm" onClick={retry}>
              Retry
            </Button>
          }
        >
          Your plans are safe; this is a connection problem.
        </Alert>
      ) : state.status === "loading" || !today ? (
        <DashboardSkeleton />
      ) : state.data.length === 0 ? (
        <EmptyState
          icon={<CalendarHeart />}
          title="No events yet"
          body="Create your first plan. It takes about a minute."
          actions={
            <ButtonLink href="/events/new" icon={<Plus size={16} aria-hidden="true" />}>
              Create an event
            </ButtonLink>
          }
        >
          <p className="m-0 flex flex-wrap items-center justify-center gap-x-3 text-body-sm">
            <span className="text-fg-muted">Try:</span>
            {TRY_LINKS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-2"
              >
                {t.label}
              </Link>
            ))}
          </p>
        </EmptyState>
      ) : (
        <EventLists summaries={state.data} today={today} showPast={showPast} />
      )}
    </PageColumn>
  );
}

function EventLists({ summaries, today, showPast }: { summaries: Parameters<typeof splitEvents>[0]; today: string; showPast: boolean }) {
  const { upcoming, past } = splitEvents(summaries, today);
  const shown = showPast ? past : upcoming;
  return (
    <>
      <LinkTabs
        label="Event lists"
        tabs={[
          { href: "/dashboard", label: "Upcoming", count: upcoming.length, current: !showPast },
          { href: "/dashboard?view=past", label: "Past", count: past.length, current: showPast },
        ]}
      />
      <h2 className="sr-only">{showPast ? "Past events" : "Upcoming events"}</h2>
      {shown.length === 0 ? (
        <p className="m-0 text-body-sm text-fg-muted">
          {showPast ? "No past events yet." : "No upcoming events. Create one to start planning."}
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((s) => (
            <li key={s.id} className="grid">
              <EventCard view={eventCardView(s, today)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function DashboardSkeleton() {
  return (
    <SkeletonRegion label="Loading your events" className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-3 rounded-lg border border-line bg-surface p-5">
          <Skeleton className="w-1/3" />
          <Skeleton className="h-[22px] w-4/5" />
          <Skeleton className="w-3/5" />
          <Skeleton className="h-2" />
          <Skeleton className="w-1/2" />
        </div>
      ))}
    </SkeletonRegion>
  );
}
