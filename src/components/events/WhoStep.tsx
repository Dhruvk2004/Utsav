"use client";

import { Lock, Plus, X } from "lucide-react";
import { useState } from "react";
import { LanguageField } from "@/components/profile/ProfileFields";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Choice";
import { FieldError, inputClasses, SelectField, TextField } from "@/components/ui/Field";
import { fieldId, honoreeRow, type HonoreeRow } from "@/lib/client/eventWizard";
import { GENDER_LABELS, HONOREE_ROLE_LABELS } from "@/lib/domain/labels";
import { GENDERS, HONOREE_ROLES } from "@/lib/domain/model/enums";
import { CAPS } from "@/lib/domain/model/event";
import type { StepProps } from "./BasicsStep";

const roleOptions = HONOREE_ROLES.map((r) => ({ value: r, label: HONOREE_ROLE_LABELS[r] }));
const genderOptions = [{ value: "", label: "Not set" }, ...GENDERS.map((g) => ({ value: g, label: GENDER_LABELS[g] }))];

/** Step 3, who it's for (spec 5.1): optional people, theme, guest flags and plan language. */
export function WhoStep({ form, setForm, errors }: StepProps) {
  const setPerson = (key: string, patch: Partial<HonoreeRow>) =>
    setForm((f) => ({ ...f, honorees: f.honorees.map((h) => (h.key === key ? { ...h, ...patch } : h)) }));

  return (
    <div className="grid gap-6">
      <section aria-labelledby="people-title" className="grid gap-3">
        <h2 id="people-title" className="m-0 text-h3 font-[650]">
          Who is it for? <span className="text-body-sm font-medium text-fg-muted">Optional, makes ideas personal</span>
        </h2>
        {form.honorees.map((person, i) => {
          const f = (leaf: string) => fieldId(["honorees", i, leaf]);
          const label = (text: string) => (
            <>
              {text}
              <span className="sr-only">, person {i + 1}</span>
            </>
          );
          return (
            <fieldset key={person.key} className="m-0 grid gap-3 rounded-lg border-0 bg-surface-sunken p-4">
              <legend className="sr-only">Person {i + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.6fr)_minmax(0,1.3fr)]">
                <SelectField
                  id={f("role")}
                  label={label("Role")}
                  dense
                  options={roleOptions}
                  value={person.role}
                  onChange={(e) => setPerson(person.key, { role: e.target.value as HonoreeRow["role"] })}
                />
                <TextField
                  id={f("name")}
                  label={label("Name")}
                  optional
                  dense
                  maxLength={40}
                  value={person.name}
                  onChange={(e) => setPerson(person.key, { name: e.target.value })}
                  error={errors[f("name")]}
                />
                <TextField
                  id={f("age")}
                  label={label("Age")}
                  optional
                  dense
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={120}
                  value={person.age}
                  onChange={(e) => setPerson(person.key, { age: e.target.value })}
                  error={errors[f("age")]}
                />
                <SelectField
                  id={f("gender")}
                  label={label("Gender")}
                  optional
                  dense
                  options={genderOptions}
                  value={person.gender}
                  onChange={(e) => setPerson(person.key, { gender: e.target.value as HonoreeRow["gender"] })}
                />
              </div>
              <InterestsInput
                id={f("interests")}
                nameSuffix={`, person ${i + 1}`}
                values={person.interests}
                onChange={(interests) => setPerson(person.key, { interests })}
                error={errors[f("interests")]}
              />
              <TextField
                id={f("notes")}
                label={label("Notes")}
                optional
                dense
                maxLength={120}
                placeholder="e.g. Nani arrives on the 3rd"
                value={person.notes}
                onChange={(e) => setPerson(person.key, { notes: e.target.value })}
                error={errors[f("notes")]}
                hint={
                  <span className="flex items-center gap-1.5">
                    <Lock size={14} aria-hidden="true" />
                    Private note, not used by AI
                  </span>
                }
              />
              <Button
                variant="ghost"
                size="sm"
                className="justify-self-start"
                onClick={() => setForm((cur) => ({ ...cur, honorees: cur.honorees.filter((h) => h.key !== person.key) }))}
              >
                Remove person {i + 1}
              </Button>
            </fieldset>
          );
        })}
        <Button
          variant="secondary"
          size="sm"
          className="justify-self-start"
          icon={<Plus size={16} aria-hidden="true" />}
          disabled={form.honorees.length >= CAPS.honorees}
          onClick={() => setForm((f) => ({ ...f, honorees: [...f.honorees, honoreeRow(f.eventType)] }))}
        >
          Add person
        </Button>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={fieldId(["theme"])}
          label="Theme"
          optional
          maxLength={200}
          value={form.theme}
          onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))}
          error={errors[fieldId(["theme"])]}
        />
        <LanguageField
          name="event-language"
          legend="Language for this plan's AI text"
          value={form.language}
          onChange={(language) => setForm((f) => ({ ...f, language }))}
          hint="Pre-filled from your profile."
        />
      </div>
      <fieldset className="m-0 grid gap-1 border-0 p-0">
        <legend className="mb-1 p-0 text-body-sm font-semibold">Guests include</legend>
        <div className="flex flex-wrap gap-x-6">
          <Checkbox
            id="event-flag-kids"
            label="Young kids"
            checked={form.flags.kids}
            onChange={(kids) => setForm((f) => ({ ...f, flags: { ...f.flags, kids } }))}
          />
          <Checkbox
            id="event-flag-elderly"
            label="Elderly guests"
            checked={form.flags.elderly}
            onChange={(elderly) => setForm((f) => ({ ...f, flags: { ...f.flags, elderly } }))}
          />
          <Checkbox
            id="event-flag-mobility"
            label="Guests with mobility needs"
            checked={form.flags.mobility}
            onChange={(mobility) => setForm((f) => ({ ...f, flags: { ...f.flags, mobility } }))}
          />
        </div>
        <span className="text-[13px] text-fg-muted">
          Kids and elderly are quick answers until you add counts on the Guests tab; then the counts win.
        </span>
      </fieldset>
      <Alert tone="info" title="Names, notes and your event title stay in Utsav." icon={<Lock aria-hidden="true" className="text-brand" />}>
        They are never sent to the AI; people are described by role, for example &quot;birthday child, age 6&quot;.
      </Alert>
    </div>
  );
}

/** Interests as removable chips plus a text box; Enter or Add puts the typed interest in the list. */
export function InterestsInput({
  id,
  nameSuffix,
  values,
  onChange,
  error,
}: {
  id: string;
  nameSuffix: string;
  values: string[];
  onChange: (values: string[]) => void;
  error?: string;
}) {
  const [draft, setDraft] = useState("");
  const full = values.length >= CAPS.interests;
  const add = () => {
    const text = draft.trim();
    if (text && !full && !values.includes(text)) onChange([...values, text]);
    setDraft("");
  };
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-body-sm font-semibold">
        Interests<span className="sr-only">{nameSuffix}</span>{" "}
        <span className="font-normal text-fg-muted">(optional, up to {CAPS.interests})</span>
      </label>
      {values.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={`Interests added${nameSuffix}`}>
          {values.map((v) => (
            <li
              key={v}
              className="inline-flex min-h-8 items-center gap-1 rounded-pill bg-brand px-3 pr-1 text-[13px] font-medium text-on-brand"
            >
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="grid size-6 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-on-brand hover:bg-[color-mix(in_srgb,var(--color-on-brand)_20%,transparent)]"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          maxLength={40}
          disabled={full}
          placeholder={full ? "Limit reached" : "e.g. Peppa Pig, painting"}
          value={draft}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className={inputClasses({ dense: true })}
        />
        <Button variant="secondary" size="sm" onClick={add} disabled={full || !draft.trim()}>
          Add <span className="sr-only">interest{nameSuffix}</span>
        </Button>
      </div>
      <FieldError id={id} message={error} />
    </div>
  );
}
