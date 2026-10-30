"use client";

import { CalendarDays, Lock } from "lucide-react";
import { EVENT_TYPE_ICONS } from "@/components/dashboard/EventCard";
import { CityField } from "@/components/profile/ProfileFields";
import { Alert } from "@/components/ui/Alert";
import { RadioCards } from "@/components/ui/Choice";
import { SelectField, TextField } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { changeEventType, eventDateHelper, festivalNote, fieldId, orderedEventTypes, type WizardForm } from "@/lib/client/eventWizard";
import { parseRupees, perGuestText } from "@/lib/client/money";
import { addDays } from "@/lib/domain/dates";
import { defaultEventTitle, EVENT_TYPE_LABELS, OCCASION_LABELS } from "@/lib/domain/labels";
import { MILESTONE_RANGES } from "@/lib/domain/model/createEvent";
import { OCCASIONS, type Occasion } from "@/lib/domain/model/enums";
import { LIMITS, type EventType } from "@/lib/domain/schemas";

export interface StepProps {
  form: WizardForm;
  setForm: (next: (form: WizardForm) => WizardForm) => void;
  errors: Record<string, string>;
  today: string | null;
}

const id = (key: string) => fieldId([key]);
const occasionOptions = [{ value: "", label: "Choose an occasion" }, ...OCCASIONS.map((o) => ({ value: o, label: OCCASION_LABELS[o] }))];

/** Step 1, the basics (spec 5.1): type, its conditional field, title, date, city, guests and budget. */
export function BasicsStep({ form, setForm, errors, today, preferredTypes }: StepProps & { preferredTypes: readonly EventType[] }) {
  const set = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const milestone = form.eventType === "birthday" || form.eventType === "anniversary" ? MILESTONE_RANGES[form.eventType] : null;
  const hasOccasion = form.eventType === "community" || form.eventType === "other";
  const placeholder = defaultEventTitle({
    eventType: form.eventType,
    occasion: form.occasion || null,
    occasionOther: form.occasionOther,
    milestone: form.milestone ? Number(form.milestone) : null,
  });
  const festival = hasOccasion ? festivalNote(form.occasion, form.eventDate) : null;

  return (
    <div className="grid gap-6">
      <RadioCards
        name="event-type"
        legend="What are you planning?"
        columns="grid-cols-2 sm:grid-cols-3 md:grid-cols-5"
        value={form.eventType}
        onChange={(t) => setForm((f) => changeEventType(f, t))}
        options={orderedEventTypes(preferredTypes).map((t) => ({ value: t, label: EVENT_TYPE_LABELS[t], icon: EVENT_TYPE_ICONS[t] }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {milestone && (
          <TextField
            id={id("milestone")}
            label={form.eventType === "birthday" ? "Turning (age)" : "Years married"}
            optional
            type="number"
            inputMode="numeric"
            min={milestone.min}
            max={milestone.max}
            value={form.milestone}
            onChange={(e) => set("milestone", e.target.value)}
            error={errors[id("milestone")]}
            hint={
              form.eventType === "birthday"
                ? "0 to 120. People's own ages go in step 3."
                : "1 to 80. Drives milestone ideas such as a decade photo wall."
            }
          />
        )}
        {hasOccasion && (
          <SelectField
            id={id("occasion")}
            label="Occasion"
            optional
            options={occasionOptions}
            value={form.occasion}
            onChange={(e) => set("occasion", e.target.value as Occasion | "")}
            error={errors[id("occasion")]}
            hint="Helps us suggest ideas that fit the occasion."
          />
        )}
        {hasOccasion && form.occasion === "other" && (
          <TextField
            id={id("occasionOther")}
            label="Tell us the occasion"
            maxLength={60}
            value={form.occasionOther}
            onChange={(e) => set("occasionOther", e.target.value)}
            error={errors[id("occasionOther")]}
            helper={`${form.occasionOther.length}/60`}
          />
        )}
        <TextField
          id={id("title")}
          label="Title"
          optional
          maxLength={80}
          placeholder={placeholder}
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          error={errors[id("title")]}
          hint={
            <span className="flex items-center gap-1.5">
              <Lock size={14} aria-hidden="true" />
              Stays in Utsav. Not sent to the AI.
            </span>
          }
        />
        <TextField
          id={id("eventDate")}
          label="Event date"
          type="date"
          required
          min={today ?? undefined}
          max={today ? addDays(today, LIMITS.maxPlanningDays) : undefined}
          value={form.eventDate}
          onChange={(e) => set("eventDate", e.target.value)}
          error={errors[id("eventDate")]}
          helper={today ? eventDateHelper(form.eventDate, today) : null}
        />
        <CityField
          id={id("city")}
          label="City"
          value={form.city}
          onChange={(v) => set("city", v)}
          error={errors[id("city")]}
          hint={form.city ? undefined : "Where most of the celebration happens."}
        />
        <TextField
          id={id("guestCount")}
          label="Guests"
          type="number"
          inputMode="numeric"
          required
          min={LIMITS.minGuests}
          max={LIMITS.maxGuests}
          value={form.guests}
          onChange={(e) => set("guests", e.target.value)}
          error={errors[id("guestCount")]}
        />
        <MoneyField
          id={id("budget")}
          label="Total budget"
          required
          value={form.budget}
          onChange={(v) => set("budget", v)}
          error={errors[id("budget")]}
          helper={perGuestText(parseRupees(form.budget), form.guests ? Number(form.guests) : null)}
        />
      </div>
      {festival && (
        <Alert tone="info" title={festival} icon={<CalendarDays aria-hidden="true" className="text-brand" />}>
          From Utsav&apos;s festival table.
        </Alert>
      )}
    </div>
  );
}
