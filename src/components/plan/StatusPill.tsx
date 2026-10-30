import { BadgeCheck, CalendarCheck, CircleDashed, CircleSlash, MessageCircle, ReceiptIndianRupee } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { PIPELINE, pipelineStep } from "@/lib/client/vendorsView";
import { VENDOR_STATUS_LABELS } from "@/lib/domain/labels";
import type { VendorStatus } from "@/lib/domain/model/enums";

/** Vendor status pills (design-system 6.4): text, icon, colour and fill style, so they read in grayscale. */
const STYLES: Record<VendorStatus, { icon: ReactNode; className: string }> = {
  to_research: {
    icon: <CircleDashed aria-hidden="true" />,
    className: "border border-dashed border-line-strong bg-neutral-tint text-fg-muted",
  },
  contacted: { icon: <MessageCircle aria-hidden="true" />, className: "bg-brand-tint text-brand" },
  quoted: { icon: <ReceiptIndianRupee aria-hidden="true" />, className: "bg-warning-tint text-warning" },
  booked: { icon: <CalendarCheck aria-hidden="true" />, className: "border border-success bg-success-tint text-success" },
  paid: { icon: <BadgeCheck aria-hidden="true" />, className: "bg-success text-on-solid" },
  not_needed: { icon: <CircleSlash aria-hidden="true" />, className: "border border-line text-fg-muted" },
};

export function StatusPill({ status }: { status: VendorStatus }) {
  const { icon, className } = STYLES[status];
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1.5 self-start rounded-pill px-2.5 text-caption font-semibold whitespace-nowrap [&_svg]:size-3.5",
        className,
      )}
    >
      {icon}
      {VENDOR_STATUS_LABELS[status]}
    </span>
  );
}

/** Five segments up to the current step; the step is spelled out for screen readers. */
export function PipelineBar({ status }: { status: VendorStatus }) {
  const step = pipelineStep(status);
  if (step === null) return null;
  return (
    <div className="flex gap-1">
      {PIPELINE.map((each, i) => (
        <span
          key={each}
          aria-hidden="true"
          className={cx(
            "h-1.5 flex-1 rounded-pill",
            i + 1 < step ? "bg-success" : i + 1 === step ? "border border-success" : "bg-neutral-tint",
          )}
        />
      ))}
      <span className="sr-only">
        Step {step} of {PIPELINE.length}: {VENDOR_STATUS_LABELS[status]}
      </span>
    </div>
  );
}
