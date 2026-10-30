import type { ReactNode } from "react";
import { cx } from "./cx";

/** A shimmering block in the final layout's geometry; static under reduced motion (design-system 6.12). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton h-3", className)} aria-hidden="true" />;
}

/** Wraps skeletons with aria-busy and a visually hidden description of what is loading. */
export function SkeletonRegion({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
