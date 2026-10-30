import { Check } from "lucide-react";
import Link from "next/link";
import { cx } from "./cx";

/**
 * Tabs are real links with aria-current (design-system 6.9), so they are shareable and work
 * without script. The current tab has a 3 px brand underline as a shape cue as well as colour.
 */
export interface LinkTab {
  href: string;
  label: string;
  current: boolean;
  count?: number;
  /** Words read after the count, e.g. "active" for "Vendors, 10 active". */
  countLabel?: string;
}

export function LinkTabs({ label, tabs, className }: { label: string; tabs: readonly LinkTab[]; className?: string }) {
  return (
    <nav aria-label={label} className={cx("flex gap-1 overflow-x-auto border-b border-line", className)}>
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.current ? "page" : undefined}
          className={cx(
            "relative inline-flex h-12 shrink-0 items-center gap-1.5 px-3.5 text-body-sm font-semibold no-underline",
            t.current
              ? "text-fg after:absolute after:inset-x-2.5 after:bottom-0 after:h-[3px] after:rounded-t-[3px] after:bg-brand"
              : "text-fg-muted hover:text-fg",
          )}
        >
          {t.label}
          {t.count !== undefined && " "}
          {t.count !== undefined && (
            <span className="rounded-pill bg-neutral-tint px-[7px] py-0.5 text-[11px] text-fg-muted">
              {t.count}
              {t.countLabel && " "}
              {t.countLabel && <span className="sr-only">{t.countLabel}</span>}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Segmented control: a radiogroup on a sunken track; the selected segment is raised with a check. */
export function SegmentedControl<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-surface-sunken p-[3px]">
      {options.map((o) => (
        <label
          key={o.value}
          className={cx(
            "inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-semibold",
            "has-checked:bg-surface has-checked:text-fg has-checked:shadow-1 has-focus-visible:outline-2 has-focus-visible:outline-(--u-focus)",
            "text-fg-muted",
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {value === o.value && <Check size={16} aria-hidden="true" />}
          {o.label}
        </label>
      ))}
    </div>
  );
}
