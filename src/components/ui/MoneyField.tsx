"use client";

import type { Ref } from "react";
import { formatRupeesInput } from "@/lib/client/money";
import { cx } from "./cx";
import { Field, type FieldProps, inputClasses } from "./Field";

type MoneyFieldProps = Omit<FieldProps, "children"> & {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  required?: boolean;
  inputRef?: Ref<HTMLInputElement>;
};

/** Rupee amount with a ₹ prefix and Indian grouping as the user types (design-system 6.2). */
export function MoneyField({ value, onChange, onBlur, required, inputRef, ...field }: MoneyFieldProps) {
  return (
    <Field {...field}>
      {(control) => (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-semibold text-fg-muted" aria-hidden="true">
            ₹
          </span>
          <input
            {...control}
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            required={required}
            value={value}
            onChange={(e) => onChange(formatRupeesInput(e.target.value))}
            onBlur={onBlur}
            className={cx(inputClasses(), "num pl-7")}
          />
        </div>
      )}
    </Field>
  );
}
