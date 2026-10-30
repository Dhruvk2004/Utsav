import { CircleAlert, Info, TriangleAlert, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { DiyaIcon } from "./icons";

export type AlertTone = "danger" | "warning" | "info" | "neutral" | "offline";

const TONES: Record<AlertTone, { box: string; icon: ReactNode }> = {
  danger: {
    box: "bg-danger-tint border-[color:color-mix(in_srgb,var(--color-danger)_40%,transparent)]",
    icon: <CircleAlert className="text-danger" aria-hidden="true" />,
  },
  warning: {
    box: "bg-warning-tint border-[color:color-mix(in_srgb,var(--color-warning)_40%,transparent)]",
    icon: <TriangleAlert className="text-warning" aria-hidden="true" />,
  },
  info: {
    box: "bg-brand-tint border-[color:color-mix(in_srgb,var(--color-brand)_30%,transparent)]",
    icon: <Info className="text-brand" aria-hidden="true" />,
  },
  neutral: { box: "bg-neutral-tint border-line", icon: <DiyaIcon className="text-fg-muted" /> },
  offline: {
    box: "bg-danger-tint border-[color:color-mix(in_srgb,var(--color-danger)_40%,transparent)]",
    icon: <WifiOff className="text-danger" aria-hidden="true" />,
  },
};

/**
 * Inline alert (design-system 6.13): tint, a 1 px border in the semantic colour, a leading icon and
 * a bold first phrase. Errors are `role="alert"`; everything else is a polite status.
 */
export function Alert({
  tone,
  title,
  children,
  action,
  icon,
  className,
}: {
  tone: AlertTone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const style = TONES[tone];
  return (
    <div
      role={tone === "danger" || tone === "offline" ? "alert" : "status"}
      className={cx("flex items-start gap-3 rounded-md border px-4 py-3 text-body-sm text-fg", style.box, className)}
    >
      <span className="mt-px shrink-0 [&_svg]:size-5">{icon ?? style.icon}</span>
      <div className="grid min-w-0 gap-1.5">
        <p className="m-0">
          <b>{title}</b>
          {children && <> {children}</>}
        </p>
        {action && <div className="justify-self-start">{action}</div>}
      </div>
    </div>
  );
}
