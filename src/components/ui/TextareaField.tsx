import type { ComponentProps } from "react";
import { cx } from "./cx";
import { describedBy, FieldError, type FieldProps, inputClasses, labelId } from "./Field";

/** Counter level: announced once when the text reaches 90% and again at 100% (design-system 6.2). */
export function counterLevel(length: number, max: number): "near" | "full" | null {
  if (length >= max) return "full";
  return length >= Math.ceil(max * 0.9) ? "near" : null;
}

type CounterProps = { id: string; length: number; max: number };

/** "23/500" below the field, plus a polite announcement that changes only at the two thresholds. */
export function CharCounter({ id, length, max }: CounterProps) {
  const level = counterLevel(length, max);
  return (
    <>
      <span id={id} className="num justify-self-end text-[13px] text-fg-muted">
        {length}/{max.toLocaleString("en-IN")}
      </span>
      <span className="sr-only" aria-live="polite">
        {level === "full" ? `${max} character limit reached.` : level === "near" ? `Nearly at the ${max} character limit.` : ""}
      </span>
    </>
  );
}

type TextareaFieldProps = Omit<FieldProps, "children" | "helper" | "why"> &
  Omit<ComponentProps<"textarea">, "id" | "value" | "maxLength"> & { value: string; maxLength: number; dense?: boolean };

/** A textarea with its counter; also used as a one-line text field with a counter via `rows={1}`. */
export function TextareaField({
  id,
  label,
  hint,
  error,
  optional,
  className,
  labelClassName,
  value,
  maxLength,
  dense,
  rows = 3,
  ...textarea
}: TextareaFieldProps) {
  const counterId = `${id}-count`;
  const hintIds = describedBy(id, { hint: Boolean(hint), error: Boolean(error) });
  return (
    <div className={cx("grid content-start gap-1.5", className)}>
      <label id={labelId(id)} htmlFor={id} className={cx("text-body-sm font-semibold", labelClassName)}>
        {label}
        {optional && <span className="font-normal text-fg-muted"> (optional)</span>}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        aria-describedby={[hintIds, counterId].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        className={inputClasses({ dense, multiline: true })}
        {...textarea}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        {hint ? (
          <span id={`${id}-hint`} className="text-[13px] text-fg-muted">
            {hint}
          </span>
        ) : (
          <span />
        )}
        <CharCounter id={counterId} length={value.length} max={maxLength} />
      </div>
      <FieldError id={id} message={error} />
    </div>
  );
}
