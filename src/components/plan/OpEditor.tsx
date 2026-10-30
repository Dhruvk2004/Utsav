"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { RadioGroup } from "@/components/ui/Choice";
import { cx } from "@/components/ui/cx";
import { Field, FieldError, inputClasses } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { TextareaField } from "@/components/ui/TextareaField";
import { formatRupeesInput } from "@/lib/client/money";
import { visibleFields, type FieldSpec, type FormValues, type OpForm } from "@/lib/client/opForms";
import type { PlanOperation } from "@/lib/domain/ops/schema";

/** "One per line" lists: up to 8 items of 160 characters. */
const LINES_MAX = 1300;

interface FieldsProps {
  idPrefix: string;
  fields: FieldSpec[];
  values: FormValues;
  errors: Record<string, string>;
  onChange: (name: string, value: string | string[]) => void;
}

/** Renders the field specs of an edit form (spec 6.1) with labels, hints and inline errors. */
export function OpFields({ idPrefix, fields, values, errors, onChange }: FieldsProps) {
  return (
    <>
      {visibleFields(fields, values).map((field) => {
        const id = `${idPrefix}-${field.name}`;
        const value = values[field.name];
        const text = typeof value === "string" ? value : "";
        const common = { id, label: field.label, hint: field.hint, error: errors[field.name], optional: field.optional };
        switch (field.kind) {
          case "textarea":
          case "lines":
            return (
              <TextareaField
                key={field.name}
                {...common}
                value={text}
                maxLength={field.kind === "textarea" ? field.max : LINES_MAX}
                onChange={(e) => onChange(field.name, e.target.value)}
              />
            );
          case "money":
            return <MoneyField key={field.name} {...common} value={formatRupeesInput(text)} onChange={(v) => onChange(field.name, v)} />;
          case "radio":
            return (
              <div key={field.name} className="grid grid-cols-[minmax(0,1fr)] gap-1">
                <RadioGroup name={id} legend={field.label} options={field.options} value={text} onChange={(v) => onChange(field.name, v)} />
                <FieldError id={id} message={errors[field.name]} />
              </div>
            );
          case "checks":
            return (
              <fieldset key={field.name} className="m-0 grid gap-1 border-0 p-0">
                <legend className="mb-1 p-0 text-body-sm font-semibold">{field.label}</legend>
                <div className="flex flex-wrap gap-x-4">
                  {field.options.map((option) => {
                    const checked = Array.isArray(value) && value.includes(option.value);
                    const others = Array.isArray(value) ? value.filter((v) => v !== option.value) : [];
                    return (
                      <label key={option.value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-body-sm">
                        <input
                          type="checkbox"
                          className="size-5 accent-brand"
                          checked={checked}
                          onChange={(e) => onChange(field.name, e.target.checked ? [...others, option.value] : others)}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          case "select":
            return (
              <Field key={field.name} {...common}>
                {(control) => (
                  <select {...control} value={text} onChange={(e) => onChange(field.name, e.target.value)} className={inputClasses()}>
                    {field.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            );
          default:
            return (
              <Field key={field.name} {...common}>
                {(control) => (
                  <input
                    {...control}
                    type={field.kind === "text" ? "text" : field.kind}
                    inputMode={field.kind === "number" ? "numeric" : undefined}
                    min={"min" in field ? field.min : undefined}
                    max={"max" in field && field.kind !== "text" ? field.max : undefined}
                    maxLength={field.kind === "text" ? field.max : undefined}
                    value={text}
                    onChange={(e) => onChange(field.name, e.target.value)}
                    className={inputClasses()}
                  />
                )}
              </Field>
            );
        }
      })}
    </>
  );
}

interface EditorProps {
  form: OpForm;
  submitLabel: string;
  /** Applies the op; resolves to a reason when it was refused, which is shown above the actions. */
  onSubmit: (op: PlanOperation) => Promise<string | null>;
  onCancel: () => void;
  /** Live "Preview:" of the op as it stands (cards), announced politely. */
  preview?: (op: PlanOperation) => ReactNode;
  heading?: ReactNode;
  className?: string;
}

/**
 * An edit form: fields, an optional live preview, then Save and Cancel. Focus starts on the first
 * field (spec R2-11); Escape cancels. Values are kept when saving fails.
 */
export function OpEditor({ form, submitLabel, onSubmit, onCancel, preview, heading, className }: EditorProps) {
  const idPrefix = useId();
  const [values, setValues] = useState(form.values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const built = form.build(values);

  // Focus starts on the first field; for radios, the chosen one (spec R2-11).
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>("input:checked, input:not([type=radio]), select, textarea")?.focus();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    const reason = await onSubmit(built.op);
    setBusy(false);
    setRefusal(reason);
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      className={cx("grid gap-4", className)}
    >
      {heading}
      <OpFields
        idPrefix={idPrefix}
        fields={form.fields}
        values={values}
        errors={errors}
        onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
      />
      {preview && (
        <div role="status" className="rounded-md bg-surface-sunken p-3 text-body-sm">
          <span className="font-semibold">Preview: </span>
          {built.ok ? preview(built.op) : "Finish the fields above to see the change."}
        </div>
      )}
      {refusal && (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {refusal}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
