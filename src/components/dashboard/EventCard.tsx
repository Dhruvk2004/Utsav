import { Cake, CalendarHeart, CircleAlert, Gem, HeartHandshake, UsersRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { OriginTag, Tag } from "@/components/ui/Chip";
import { ProgressBar } from "@/components/ui/Progress";
import type { EventCardView } from "@/lib/client/eventCard";
import { eventHref } from "@/lib/client/navigation";
import type { EventType } from "@/lib/domain/schemas";

export const EVENT_TYPE_ICONS: Record<EventType, ReactNode> = {
  wedding: <HeartHandshake aria-hidden="true" />,
  birthday: <Cake aria-hidden="true" />,
  anniversary: <Gem aria-hidden="true" />,
  community: <UsersRound aria-hidden="true" />,
  other: <CalendarHeart aria-hidden="true" />,
};

/**
 * Dashboard event card (design-system 6.14): the whole card is one link. Overdue tasks are written
 * out with an icon, never shown by colour alone; waiting AI suggestions carry the flame chip.
 */
export function EventCard({ view }: { view: EventCardView }) {
  return (
    <Link
      href={eventHref(view.id)}
      className="group grid content-start gap-2.5 rounded-lg border border-line bg-surface p-4 text-fg no-underline shadow-1 transition-shadow duration-[120ms] hover:shadow-2 sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <Tag tone="type" icon={EVENT_TYPE_ICONS[view.eventType]}>
          {view.typeLabel}
        </Tag>
        <span className="text-body-sm font-semibold">{view.countdown}</span>
      </div>
      <h3 className="m-0 font-display text-[1.375rem] leading-tight font-semibold group-hover:underline">{view.title}</h3>
      <p className="m-0 text-body-sm text-fg-muted">{view.meta}</p>
      <div className="flex items-center justify-between gap-2 text-body-sm">
        <span className="num font-semibold">{view.budget}</span>
        <span className="text-fg-muted">{view.tasksText}</span>
      </div>
      <ProgressBar label="Tasks done" value={view.tasksPercent} valueText={view.tasksText} />
      {view.signal &&
        (view.signal.tone === "danger" ? (
          <p className="m-0 flex items-center gap-1.5 text-body-sm text-danger">
            <CircleAlert size={16} aria-hidden="true" />
            {view.signal.text}
          </p>
        ) : (
          <p className="m-0 text-body-sm">{view.signal.text}</p>
        ))}
      <div className="flex flex-wrap gap-2 empty:hidden">
        {view.pendingText && <OriginTag origin="ai">{view.pendingText}</OriginTag>}
        {view.fromTemplate && <OriginTag origin="template" />}
      </div>
    </Link>
  );
}
