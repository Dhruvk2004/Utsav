import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Empty state (design-system 6.11, spec 3.4): an icon in a brand-tint circle, a title, one sentence,
 * one primary action and an optional secondary action, on the faint rangoli grid.
 */
export function EmptyState({
  icon,
  title,
  body,
  actions,
  children,
  headingLevel = 2,
  className,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  actions: ReactNode;
  children?: ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div
      className={cx(
        "rangoli grid justify-items-center gap-2.5 rounded-lg border border-dashed border-line-strong px-6 py-10 text-center",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-brand-tint text-brand [&_svg]:size-6" aria-hidden="true">
        {icon}
      </span>
      <Heading className={cx("m-0", headingLevel === 2 ? "text-h2 font-bold" : "text-h3 font-[650]")}>{title}</Heading>
      <p className="m-0 max-w-[48ch] text-body-sm text-fg-muted">{body}</p>
      <div className="flex flex-wrap justify-center gap-2">{actions}</div>
      {children}
    </div>
  );
}
