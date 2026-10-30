import { Check, Pencil } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { DiyaIcon, FlameIcon } from "./icons";

/**
 * Chips and tags (design-system 6.3). Choice chips are toggle buttons (`aria-pressed`); tags are
 * static labels. Origin is always written, never shown by colour alone.
 */

export function ChoiceChip({
  selected,
  onToggle,
  children,
  size = "md",
  disabled,
}: {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  return (
    // The 36 px (or 28 px) pill sits inside a 44 px hit area through vertical padding.
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
      className="group inline-flex min-h-11 cursor-pointer items-center disabled:cursor-not-allowed"
    >
      <span
        className={cx(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border font-medium transition-colors duration-[120ms]",
          size === "sm" ? "min-h-8 px-3 text-[13px]" : "min-h-9 px-3.5 text-body-sm",
          selected
            ? "border-brand bg-brand text-on-brand"
            : "border-line-strong bg-surface text-fg group-hover:border-brand group-disabled:opacity-45",
        )}
      >
        {selected && <Check size={16} aria-hidden="true" />}
        {children}
      </span>
    </button>
  );
}

interface ChipGroupProps<T extends string> {
  legend: ReactNode;
  options: readonly { value: T; label: string }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  hint?: ReactNode;
  size?: "sm" | "md";
  /** Unselected chips are disabled once this many are chosen. */
  max?: number;
  id: string;
}

/** A multi-select set of chips with a group name for assistive tech. */
export function ChipGroup<T extends string>({ legend, options, selected, onToggle, hint, size, max, id }: ChipGroupProps<T>) {
  const full = max !== undefined && selected.length >= max;
  return (
    <div role="group" aria-labelledby={`${id}-legend`} aria-describedby={hint ? `${id}-hint` : undefined} className="grid gap-1">
      <span id={`${id}-legend`} className="text-body-sm font-semibold">
        {legend}
      </span>
      <div className="flex flex-wrap gap-x-1.5">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <ChoiceChip key={o.value} selected={on} onToggle={() => onToggle(o.value)} size={size} disabled={full && !on}>
              {o.label}
            </ChoiceChip>
          );
        })}
      </div>
      {hint && (
        <span id={`${id}-hint`} className="text-[13px] text-fg-muted">
          {hint}
        </span>
      )}
    </div>
  );
}

export type TagTone = "ai" | "utsav" | "you" | "neutral" | "type" | "success" | "warning" | "danger";

const TONES: Record<TagTone, string> = {
  ai: "bg-accent-tint text-fg text-caption",
  utsav: "bg-brand-tint text-brand text-caption",
  you: "bg-neutral-tint text-fg-muted text-caption",
  neutral: "bg-neutral-tint text-fg-muted text-caption",
  type: "bg-brand-tint text-brand uppercase tracking-[0.06em] text-[11px]",
  success: "bg-success-tint text-success text-caption",
  warning: "bg-warning-tint text-warning text-caption",
  danger: "bg-danger-tint text-danger text-caption",
};

/** A 24 px status or label pill with an optional leading icon. */
export function Tag({ tone, icon, children, className }: { tone: TagTone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1.5 self-start justify-self-start whitespace-nowrap rounded-pill px-2.5 font-semibold leading-none [&_svg]:size-3.5",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export type Origin = "ai" | "utsav" | "you" | "template" | "library";

const ORIGINS: Record<Origin, { tone: TagTone; label: string; icon: ReactNode }> = {
  ai: { tone: "ai", label: "AI suggestion", icon: <FlameIcon className="text-warning" /> },
  utsav: { tone: "utsav", label: "Suggested by Utsav", icon: <DiyaIcon /> },
  you: { tone: "you", label: "Edited by you", icon: <Pencil aria-hidden="true" /> },
  template: { tone: "neutral", label: "Starter template", icon: <DiyaIcon /> },
  library: { tone: "neutral", label: "From Utsav's idea library", icon: <DiyaIcon /> },
};

/** Who wrote an item: the "AI suggestion" chip (flame), "Suggested by Utsav" (diya) and the rest. */
export function OriginTag({ origin, children }: { origin: Origin; children?: ReactNode }) {
  const { tone, label, icon } = ORIGINS[origin];
  return (
    <Tag tone={tone} icon={icon}>
      {children ?? label}
    </Tag>
  );
}

/**
 * The AI surface: a card with the 4 px Marigold edge (or the Aubergine edge for code proposals).
 * The edge is decorative, so it always comes with an `OriginTag` inside.
 */
export function AiSurface({
  origin = "ai",
  className,
  children,
  ...props
}: { origin?: "ai" | "utsav"; className?: string; children: ReactNode } & ComponentProps<"article">) {
  return (
    <article
      className={cx(
        "grid gap-2.5 rounded-lg border border-l-4 border-line bg-surface p-4 shadow-1",
        origin === "ai" ? "border-l-accent" : "border-l-brand",
        className,
      )}
      {...props}
    >
      {children}
    </article>
  );
}

/** Single-choice chips ("Keep it simple · Balanced · Go all out"): native radios drawn as pills. */
export function ChipRadioGroup<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: ReactNode;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="m-0 grid gap-1 border-0 p-0">
      <legend className="mb-1 p-0 text-body-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-x-1.5">
        {options.map((o) => (
          <label key={o.value} className="group inline-flex min-h-11 cursor-pointer items-center">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={cx(
                "inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-line-strong bg-surface px-3.5 text-body-sm font-medium text-fg group-hover:border-brand",
                "peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--u-focus)",
              )}
            >
              {value === o.value && <Check size={16} aria-hidden="true" />}
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
