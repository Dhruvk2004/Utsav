import { CircleAlert, Info } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

/**
 * Form fields (design-system 6.2): label above, help below linked with aria-describedby, and an
 * error with an icon that sets aria-invalid. Values are never cleared on error.
 */

export interface ControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  /** "Why we ask" lines in onboarding: an info icon plus text. */
  why?: ReactNode;
  error?: string;
  optional?: boolean;
  /** Extra text under the control, e.g. a live helper ("About ₹7,142 per guest"). */
  helper?: ReactNode;
  className?: string;
  labelClassName?: string;
  children: (control: ControlProps) => ReactNode;
}

export const hintId = (id: string) => `${id}-hint`;
export const errorId = (id: string) => `${id}-error`;
export const labelId = (id: string) => `${id}-label`;

export function describedBy(id: string, parts: { hint?: boolean; error?: boolean }): string | undefined {
  return [parts.hint && hintId(id), parts.error && errorId(id)].filter(Boolean).join(" ") || undefined;
}

export function Field({ id, label, hint, why, error, optional, helper, className, labelClassName, children }: FieldProps) {
  const hasHint = Boolean(hint || why || helper);
  return (
    <div className={cx("grid content-start gap-1.5", className)}>
      <label id={labelId(id)} htmlFor={id} className={cx("text-body-sm font-semibold", labelClassName)}>
        {label}
        {optional && <span className="font-normal text-fg-muted"> (optional)</span>}
      </label>
      {children({
        id,
        "aria-describedby": describedBy(id, { hint: hasHint, error: Boolean(error) }),
        "aria-invalid": error ? true : undefined,
      })}
      {hasHint && (
        <div id={hintId(id)} className="grid gap-1 text-[13px] text-fg-muted">
          {/* Blocks, so screen readers pause between the parts of the description. */}
          {helper && <div className="num">{helper}</div>}
          {hint && <div>{hint}</div>}
          {why && (
            <div className="flex items-start gap-2">
              <Info size={16} className="mt-px" aria-hidden="true" />
              {why}
            </div>
          )}
        </div>
      )}
      <FieldError id={id} message={error} />
    </div>
  );
}

/** The inline error under a control. Appears instantly (never animated). */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={errorId(id)} className="m-0 flex items-start gap-1.5 text-[13px] text-danger">
      <CircleAlert size={16} className="mt-px" aria-hidden="true" />
      {message}
    </p>
  );
}

/** Text, number, date and select controls share one look; `dense` is for table rows, `multiline` for textareas. */
export function inputClasses({ dense = false, multiline = false }: { dense?: boolean; multiline?: boolean } = {}): string {
  return cx(
    "w-full min-w-0 border border-line-strong bg-surface text-fg placeholder:text-fg-muted hover:border-fg-muted",
    "focus-visible:border-brand aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-surface-sunken",
    dense ? "rounded-sm px-2.5 text-body-sm" : "rounded-md px-3 text-[15px]",
    multiline ? "min-h-22 resize-y py-2.5 leading-normal" : dense ? "min-h-9" : "min-h-11",
  );
}

type TextFieldProps = Omit<FieldProps, "children"> & Omit<ComponentProps<"input">, "id"> & { dense?: boolean };

export function TextField({ id, label, hint, why, error, optional, helper, className, labelClassName, dense, ...input }: TextFieldProps) {
  return (
    <Field {...{ id, label, hint, why, error, optional, helper, className, labelClassName }}>
      {(control) => <input type="text" {...control} {...input} className={inputClasses({ dense })} />}
    </Field>
  );
}

type SelectFieldProps = Omit<FieldProps, "children"> &
  Omit<ComponentProps<"select">, "id"> & { options: readonly { value: string; label: string }[]; dense?: boolean };

export function SelectField({
  id,
  label,
  hint,
  why,
  error,
  optional,
  helper,
  className,
  labelClassName,
  options,
  dense,
  ...select
}: SelectFieldProps) {
  return (
    <Field {...{ id, label, hint, why, error, optional, helper, className, labelClassName }}>
      {(control) => (
        <select {...control} {...select} className={inputClasses({ dense })}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
