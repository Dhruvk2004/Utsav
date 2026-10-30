"use client";

import { Cake, Heart, ListChecks, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { ChipGroup } from "@/components/ui/Chip";
import { RadioCards, RadioGroup } from "@/components/ui/Choice";
import { Combobox } from "@/components/ui/Combobox";
import { TextField } from "@/components/ui/Field";
import { toggleIn, toggleTradition } from "@/lib/client/profileForm";
import { suggestCities } from "@/lib/domain/cities";
import { DIETARY_LABELS, EVENT_TYPE_LABELS, ROLE_LABELS, TRADITION_LABELS } from "@/lib/domain/labels";
import { DIETARY, PROFILE_ROLES, TRADITIONS, type Dietary, type ProfileRole, type Tradition } from "@/lib/domain/model/enums";
import { MAX_TRADITIONS } from "@/lib/domain/model/user";
import { EVENT_TYPES, type EventType, type Language } from "@/lib/domain/schemas";

/**
 * Profile inputs shared by onboarding, Settings and the event wizard, so a value is asked the same
 * way everywhere.
 */

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

export const TRADITION_OPTIONS = options(TRADITIONS, TRADITION_LABELS);
export const DIETARY_OPTIONS = options(DIETARY, DIETARY_LABELS);
export const EVENT_TYPE_OPTIONS = options(EVENT_TYPES, EVENT_TYPE_LABELS);

export function CityField({
  id,
  label = "Home city",
  value,
  onChange,
  onBlur,
  error,
  why,
  hint,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  why?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Combobox
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      error={error}
      why={why}
      hint={hint}
      listLabel="City suggestions"
      autoComplete="address-level2"
      suggest={(q) => suggestCities(q).map((c) => ({ value: c.name, detail: c.state }))}
    />
  );
}

export function LanguageField({
  name,
  legend,
  value,
  onChange,
  hint,
}: {
  name: string;
  legend: string;
  value: Language;
  onChange: (v: Language) => void;
  hint?: ReactNode;
}) {
  return (
    <RadioGroup
      name={name}
      legend={legend}
      value={value}
      onChange={onChange}
      hint={hint}
      options={[
        { value: "en", label: "English" },
        {
          value: "hi",
          label: (
            <>
              <span lang="hi">हिन्दी</span> (Hindi)
            </>
          ),
        },
      ]}
    />
  );
}

const ROLE_ICONS: Record<ProfileRole, ReactNode> = {
  self_family: <Heart size={20} aria-hidden="true" />,
  parent: <Cake size={20} aria-hidden="true" />,
  community: <UsersRound size={20} aria-hidden="true" />,
  professional: <ListChecks size={20} aria-hidden="true" />,
};

export function RoleCards({ value, onChange, legend }: { value: ProfileRole | null; onChange: (v: ProfileRole) => void; legend: string }) {
  return (
    <RadioCards
      name="role"
      legend={legend}
      value={value}
      onChange={onChange}
      options={PROFILE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], icon: ROLE_ICONS[r] }))}
    />
  );
}

export function EventTypeChips({
  id,
  legend = "Event types",
  selected,
  onChange,
  hint,
}: {
  id: string;
  legend?: string;
  selected: EventType[];
  onChange: (v: EventType[]) => void;
  hint?: ReactNode;
}) {
  return (
    <ChipGroup
      id={id}
      legend={legend}
      options={EVENT_TYPE_OPTIONS}
      selected={selected}
      onToggle={(t) => onChange(toggleIn(selected, t))}
      hint={hint}
    />
  );
}

interface TraditionProps {
  id: string;
  /** Id of the Mixed/other text field; defaults to `${id}-other`. */
  otherId?: string;
  selected: Tradition[];
  onChange: (v: Tradition[]) => void;
  other: string;
  onOtherChange: (v: string) => void;
  otherError?: string;
  otherHint?: ReactNode;
  legend?: string;
}

/** The 19 tradition chips; choosing Mixed/other reveals a short text field right below (spec 4.2). */
export function TraditionFields({
  id,
  otherId = `${id}-other`,
  selected,
  onChange,
  other,
  onOtherChange,
  otherError,
  otherHint,
  legend = "Traditions (choose any)",
}: TraditionProps) {
  return (
    <div className="grid gap-2">
      <ChipGroup
        id={id}
        legend={legend}
        size="sm"
        options={TRADITION_OPTIONS}
        selected={selected}
        max={MAX_TRADITIONS}
        onToggle={(t) => onChange(toggleTradition(selected, t))}
        hint={`Choose up to ${MAX_TRADITIONS}. "Prefer not to say" clears the others.`}
      />
      {selected.includes("mixed_other") && (
        <TextField
          id={otherId}
          label="Mixed/other: tell us in a few words"
          dense
          value={other}
          maxLength={60}
          onChange={(e) => onOtherChange(e.target.value)}
          error={otherError}
          helper={`${other.length}/60`}
          hint={otherHint ?? "Optional, up to 60 characters. Used like your other answers, never as an instruction."}
          className="max-w-[420px]"
        />
      )}
    </div>
  );
}

export function DietaryChips({
  id,
  legend = "Usual dietary needs",
  selected,
  onChange,
}: {
  id: string;
  legend?: string;
  selected: Dietary[];
  onChange: (v: Dietary[]) => void;
}) {
  return (
    <ChipGroup
      id={id}
      legend={legend}
      size="sm"
      options={DIETARY_OPTIONS}
      selected={selected}
      onToggle={(d) => onChange(toggleIn(selected, d))}
    />
  );
}
