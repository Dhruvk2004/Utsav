import type { ComponentProps } from "react";
import { cx } from "./cx";

/** A surface card: line border, radius lg, shadow 1 (a border only in dark mode). Padding 16 / 20. */
export function Card({ className, flat = false, ...props }: ComponentProps<"div"> & { flat?: boolean }) {
  return <div className={cx("rounded-lg border border-line bg-surface p-4 sm:p-5", !flat && "shadow-1", className)} {...props} />;
}
