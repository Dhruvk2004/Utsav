"use client";

import { Plus, X } from "lucide-react";
import { DietaryChips, TraditionFields } from "@/components/profile/ProfileFields";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Choice";
import { FieldError, TextField } from "@/components/ui/Field";
import { TextareaField } from "@/components/ui/TextareaField";
import { fieldId, functionRow, vibePlaceholder, type FunctionRow } from "@/lib/client/eventWizard";
import { formatDisplayDate } from "@/lib/domain/dates";
import { functionDateWindow } from "@/lib/domain/model/createEvent";
import { LIMITS } from "@/lib/domain/schemas";
import type { StepProps } from "./BasicsStep";

/** Step 2, the shape (spec 5.1): functions or parts with optional date, time and share; vibe, traditions, dietary. */
export function ShapeStep({ form, setForm, errors, today }: StepProps) {
  const wedding = form.eventType === "wedding";
  const noun = wedding ? "function" : "part";
  const dateWindow = today && form.eventDate ? functionDateWindow(form.eventDate, today) : null;

  const setRow = (key: string, patch: Partial<FunctionRow>) =>
    setForm((f) => ({ ...f, functions: f.functions.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));

  return (
    <div className="grid gap-6">
      {!wedding && (
        <Toggle
          id="event-has-parts"
          label="Does this event have several parts?"
          hint="For example a puja and a dinner. Each part gets its own date, time and share."
          checked={form.hasParts}
          onChange={(on) =>
            setForm((f) => ({
              ...f,
              hasParts: on,
              functions: on && f.functions.length === 0 ? [functionRow(), functionRow()] : f.functions,
            }))
          }
        />
      )}
      {form.hasParts && (
        <section aria-labelledby="functions-title" className="grid gap-3">
          <h2 id="functions-title" className="m-0 text-h3 font-[650]">
            {wedding ? "Functions" : "Parts"}
          </h2>
          <div id={fieldId(["functions"])} tabIndex={-1} className="grid gap-1 outline-none">
            <p className="m-0 text-[13px] text-fg-muted">
              Shares left blank are suggested by the plan; Utsav makes them add up to 100%.
              {dateWindow && ` Dates can be from ${formatDisplayDate(dateWindow.from)} to ${formatDisplayDate(dateWindow.to)}.`}
            </p>
            <FieldError id={fieldId(["functions"])} message={errors[fieldId(["functions"])]} />
          </div>
          <ul className="m-0 grid list-none gap-3 p-0">
            {form.functions.map((row, i) => {
              const f = (leaf: string) => fieldId(["functions", i, leaf]);
              const name = row.name.trim() || `${wedding ? "Function" : "Part"} ${i + 1}`;
              // Visible labels repeat per row; the hidden suffix keeps each control's name unique.
              const label = (text: string) => (
                <>
                  {text}
                  <span className="sr-only">
                    , {noun} {i + 1}
                  </span>
                </>
              );
              return (
                <li
                  key={row.key}
                  className="grid gap-3 rounded-lg border border-line bg-surface p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_auto] md:items-start"
                >
                  <TextField
                    id={f("name")}
                    label={label("Name")}
                    dense
                    maxLength={40}
                    value={row.name}
                    onChange={(e) => setRow(row.key, { name: e.target.value })}
                    error={errors[f("name")]}
                  />
                  <TextField
                    id={f("date")}
                    label={label("Date")}
                    optional
                    dense
                    type="date"
                    min={dateWindow?.from}
                    max={dateWindow?.to}
                    value={row.date}
                    onChange={(e) => setRow(row.key, { date: e.target.value })}
                    error={errors[f("date")]}
                  />
                  <TextField
                    id={f("startTime")}
                    label={label("Start")}
                    optional
                    dense
                    type="time"
                    value={row.startTime}
                    onChange={(e) => setRow(row.key, { startTime: e.target.value })}
                    error={errors[f("startTime")]}
                  />
                  <TextField
                    id={f("endTime")}
                    label={label("End")}
                    optional
                    dense
                    type="time"
                    value={row.endTime}
                    onChange={(e) => setRow(row.key, { endTime: e.target.value })}
                    error={errors[f("endTime")]}
                  />
                  <TextField
                    id={f("sharePercent")}
                    label={label("Share %")}
                    optional
                    dense
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    placeholder="auto"
                    value={row.share}
                    onChange={(e) => setRow(row.key, { share: e.target.value })}
                    error={errors[f("sharePercent")]}
                  />
                  <Button
                    variant="ghost"
                    iconOnly
                    aria-label={`Remove ${name}`}
                    className="justify-self-end md:mt-6"
                    onClick={() => setForm((current) => ({ ...current, functions: current.functions.filter((r) => r.key !== row.key) }))}
                  >
                    <X size={18} aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button
            variant="secondary"
            size="sm"
            className="justify-self-start"
            icon={<Plus size={16} aria-hidden="true" />}
            disabled={form.functions.length >= LIMITS.maxFunctions}
            onClick={() => setForm((f) => ({ ...f, functions: [...f.functions, functionRow()] }))}
          >
            Add {noun}
          </Button>
          {form.functions.length >= LIMITS.maxFunctions && (
            <p className="m-0 text-[13px] text-fg-muted">
              Up to {LIMITS.maxFunctions} {noun}s.
            </p>
          )}
        </section>
      )}
      <TextareaField
        id={fieldId(["vibe"])}
        label="Vibe"
        optional
        rows={2}
        maxLength={LIMITS.maxTextLength}
        placeholder={vibePlaceholder(form.eventType)}
        value={form.vibe}
        onChange={(e) => setForm((f) => ({ ...f, vibe: e.target.value }))}
        error={errors[fieldId(["vibe"])]}
      />
      <div className="grid gap-5 md:grid-cols-2">
        <TraditionFields
          id={fieldId(["tradition"])}
          otherId={fieldId(["traditionOther"])}
          legend="Traditions"
          selected={form.tradition}
          onChange={(tradition) => setForm((f) => ({ ...f, tradition }))}
          other={form.traditionOther}
          onOtherChange={(traditionOther) => setForm((f) => ({ ...f, traditionOther }))}
          otherError={errors[fieldId(["traditionOther"])]}
          otherHint="Pre-filled from your profile. Up to 60 characters."
        />
        <DietaryChips
          id={fieldId(["dietary"])}
          legend="Dietary"
          selected={form.dietary}
          onChange={(dietary) => setForm((f) => ({ ...f, dietary }))}
        />
      </div>
    </div>
  );
}
