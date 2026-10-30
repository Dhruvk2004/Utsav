import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Checkboxes, radio groups, radio cards and switches. Native inputs carry the semantics and the
 * keyboard behaviour; selection is shown with a border, a tint and a check icon, never colour alone.
 */

export interface ChoiceOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  lang?: string;
}

const focusRing = "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--u-focus)";

export function Checkbox({
  id,
  label,
  checked,
  onChange,
  hint,
}: {
  id: string;
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
}) {
  return (
    <div className="grid gap-0.5">
      <label htmlFor={id} className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-body-sm">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="size-5 shrink-0 cursor-pointer accent-brand"
        />
        {label}
      </label>
      {hint && (
        <span id={`${id}-hint`} className="pl-7.5 text-[13px] text-fg-muted">
          {hint}
        </span>
      )}
    </div>
  );
}

interface GroupProps<T extends string> {
  name: string;
  legend: ReactNode;
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  hint?: ReactNode;
  className?: string;
}

/** Inline radios ("English · हिन्दी (Hindi)"). */
export function RadioGroup<T extends string>({ name, legend, options, value, onChange, hint, className }: GroupProps<T>) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <fieldset className={cx("m-0 grid gap-1.5 border-0 p-0", className)} aria-describedby={hintId}>
      <legend className="mb-1.5 p-0 text-body-sm font-semibold">{legend}</legend>
      <div className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-2">
        {options.map((o) => (
          <label key={o.value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-body-sm">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="size-5 cursor-pointer accent-brand"
            />
            <span lang={o.lang}>{o.label}</span>
          </label>
        ))}
      </div>
      {hint && (
        <span id={hintId} className="text-[13px] text-fg-muted">
          {hint}
        </span>
      )}
    </fieldset>
  );
}

/** Radio cards (event type, role): brand border, tint and a corner check when selected. */
export function RadioCards<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  hint,
  className,
  columns = "sm:grid-cols-2",
}: GroupProps<T> & { columns?: string }) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <fieldset className={cx("m-0 grid gap-2.5 border-0 p-0", className)} aria-describedby={hintId}>
      <legend className="mb-2.5 p-0 text-body-sm font-semibold">{legend}</legend>
      <div className={cx("grid grid-cols-1 gap-2.5", columns)}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cx(
              "group relative grid min-h-11 cursor-pointer content-start justify-items-start gap-2 rounded-lg border-[1.5px] border-line-strong bg-surface p-4 text-[15px] font-semibold",
              "hover:border-brand has-checked:border-2 has-checked:border-brand has-checked:bg-brand-tint",
              focusRing,
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
            {o.icon && <span className="text-brand">{o.icon}</span>}
            <span className="pr-6">{o.label}</span>
            <span
              className="absolute top-2.5 right-2.5 hidden size-5 place-items-center rounded-full bg-brand text-on-brand group-has-checked:grid"
              aria-hidden="true"
            >
              <Check size={14} strokeWidth={3} />
            </span>
          </label>
        ))}
      </div>
      {hint && (
        <span id={hintId} className="text-[13px] text-fg-muted">
          {hint}
        </span>
      )}
    </fieldset>
  );
}

/** A switch with its question as the visible label. */
export function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface px-4 py-3">
      <div className="grid gap-0.5">
        <span id={`${id}-label`} className="text-body-sm font-semibold">
          {label}
        </span>
        {hint && (
          <span id={`${id}-hint`} className="text-[13px] text-fg-muted">
            {hint}
          </span>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center"
      >
        <span className={cx("relative h-6 w-10 rounded-pill transition-colors duration-[120ms]", checked ? "bg-brand" : "bg-line-strong")}>
          <span
            className={cx(
              "absolute top-[3px] size-[18px] rounded-full transition-[left] duration-[120ms]",
              checked ? "left-[19px] bg-on-brand" : "left-[3px] bg-surface",
            )}
          />
        </span>
      </button>
    </div>
  );
}
