"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ErrorSummary } from "@/components/ui/ErrorSummary";
import { TextField } from "@/components/ui/Field";
import {
  cateringText,
  COUNT_FIELDS,
  COUNT_LABELS,
  guestsFormValues,
  guestsIssues,
  guestsOp,
  type GuestsFormValues,
} from "@/lib/client/guestsForm";
import { useWorkspace } from "../WorkspaceContext";

type Name = keyof GuestsFormValues;
const LABELS: Record<Name, string> = { ...COUNT_LABELS, buffer: "Catering buffer (%)" };
const NAMES: readonly Name[] = ["total", ...COUNT_FIELDS, "buffer"];

/**
 * Guests (spec 5.8, 10.12): counts only, never names or numbers. Messages appear on blur and on
 * save, with an error summary on save; kids and elderly counts also set the matching flags.
 */
export function GuestsTab() {
  const { plan, edit } = useWorkspace();
  const [values, setValues] = useState(() => guestsFormValues(plan.guests));
  const [touched, setTouched] = useState<Partial<Record<Name, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const summary = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const issues = guestsIssues(values);
  const shown = (name: Name) => (submitted || touched[name] ? issues[name] : undefined);
  const catering = cateringText(values);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(issues).length > 0) {
      setAttempts((n) => n + 1);
      return;
    }
    const result = await edit([guestsOp(values)], "Guest counts", { showsError: true });
    setError(result.ok ? null : (result.reason ?? "The counts could not be saved."));
  }

  // The error summary takes focus on each failed save (design-system 6.2).
  useEffect(() => {
    if (attempts > 0) summary.current?.focus();
  }, [attempts]);

  const field = (name: Name) => (
    <TextField
      key={name}
      id={`guests-${name}`}
      label={LABELS[name]}
      inputMode="numeric"
      optional={name !== "total" && name !== "buffer"}
      value={values[name]}
      error={shown(name)}
      onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value.replace(/\D/g, "") }))}
      onBlur={() => setTouched((t) => ({ ...t, [name]: true }))}
    />
  );

  return (
    <form noValidate onSubmit={save} className="grid max-w-3xl gap-5">
      <Alert tone="info" title="Utsav stores counts only,">
        never names or phone numbers.
      </Alert>
      {submitted && Object.keys(issues).length > 0 && (
        <ErrorSummary
          ref={summary}
          goal="save"
          errors={NAMES.flatMap((name) => (issues[name] ? [{ id: `guests-${name}`, label: LABELS[name], message: issues[name] }] : []))}
        />
      )}
      <fieldset className="m-0 grid grid-cols-1 gap-4 border-0 p-0 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 p-0 text-h3 font-[650]">Who is coming</legend>
        {field("total")}
        {field("adults")}
        {field("kids")}
        {field("elderly")}
      </fieldset>
      <fieldset className="m-0 grid grid-cols-1 gap-4 border-0 p-0 sm:grid-cols-3">
        <legend className="mb-2 p-0 text-h3 font-[650]">Food preferences</legend>
        {COUNT_FIELDS.filter((name) => name === "veg" || name === "jain" || name === "nonveg").map(field)}
      </fieldset>
      <section
        aria-labelledby="catering-heading"
        className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-line bg-surface p-4"
      >
        <h2 id="catering-heading" className="m-0 text-h3 font-[650]">
          Catering estimate
        </h2>
        <div className="max-w-48">{field("buffer")}</div>
        <p role="status" className="num m-0 text-body-sm font-semibold">
          {catering ?? "Enter the guest count and buffer to estimate plates."}
        </p>
      </section>
      {error && (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="justify-self-start">
        Save counts
      </Button>
    </form>
  );
}
