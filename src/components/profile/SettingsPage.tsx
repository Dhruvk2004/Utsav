"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { useServices } from "@/components/data/ServicesProvider";
import { useAsync } from "@/components/data/useAsync";
import { useToday } from "@/components/data/useToday";
import { Avatar } from "@/components/shell/Avatar";
import { PageColumn } from "@/components/shell/Main";
import { Alert } from "@/components/ui/Alert";
import { useAnnounce } from "@/components/ui/Announcer";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorSummary, type SummaryError } from "@/components/ui/ErrorSummary";
import { SelectField, TextField } from "@/components/ui/Field";
import { ProgressBar } from "@/components/ui/Progress";
import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { profileFieldErrors } from "@/lib/client/profileForm";
import { BUDGET_STYLE_LABELS, DETAIL_LEVEL_LABELS, ROLE_LABELS } from "@/lib/domain/labels";
import { BUDGET_STYLES, DETAIL_LEVELS, PROFILE_ROLES, type BudgetStyle, type ProfileRole } from "@/lib/domain/model/enums";
import { AI_DAILY_QUOTA, aiUsedToday, type UserProfile } from "@/lib/domain/model/user";
import { CityField, DietaryChips, EventTypeChips, LanguageField, TraditionFields } from "./ProfileFields";

/** Profile and account (spec 10.14): profile defaults for new events, AI usage, re-run onboarding and sign out. */
export function SettingsPage() {
  const { profiles } = useServices();
  const load = useCallback((signal: AbortSignal) => profiles.load(signal), [profiles]);
  const { state, retry } = useAsync(load);

  return (
    <PageColumn narrow className="grid gap-4">
      <h1 className="m-0 font-display text-h1 font-semibold">Settings</h1>
      {state.status === "loading" && (
        <SkeletonRegion label="Loading your settings" className="grid gap-4">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
        </SkeletonRegion>
      )}
      {state.status === "error" && (
        <Alert
          tone="danger"
          title="Couldn't load your settings."
          action={
            <Button variant="secondary" size="sm" onClick={retry}>
              Retry
            </Button>
          }
        >
          Check your connection and try again.
        </Alert>
      )}
      {state.status === "ready" && <SettingsForm profile={state.data} />}
    </PageColumn>
  );
}

const roleOptions = [{ value: "", label: "Not set" }, ...PROFILE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))];
const budgetOptions = [{ value: "", label: "Not set" }, ...BUDGET_STYLES.map((b) => ({ value: b, label: BUDGET_STYLE_LABELS[b] }))];
const detailOptions = DETAIL_LEVELS.map((d) => ({ value: d, label: DETAIL_LEVEL_LABELS[d] }));

export function SettingsForm({ profile }: { profile: UserProfile }) {
  const { profiles, auth } = useServices();
  const router = useRouter();
  const announce = useAnnounce();
  const showToast = useToast();
  const today = useToday();
  const [form, setForm] = useState(profile);
  const [checked, setChecked] = useState(false);
  const [summary, setSummary] = useState<SummaryError[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const errors = checked ? profileFieldErrors(form) : {};
  const update = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = profileFieldErrors(form);
    setChecked(true);
    const labels: Record<string, [string, string]> = {
      displayName: ["set-name", "Name"],
      homeCity: ["set-city", "Home city"],
      traditionOther: ["set-traditions-other", "Traditions, Mixed/other"],
    };
    const list = Object.entries(found).map(([key, message]) => ({ id: labels[key][0], label: labels[key][1], message }));
    setSummary(list);
    if (list.length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setSaving(true);
    setSaveError(false);
    try {
      const { displayName, homeCity, language, role, eventTypes, traditions, traditionOther, dietary, budgetStyle, detailLevel } = form;
      setForm(
        await profiles.save({
          displayName,
          homeCity,
          language,
          role,
          eventTypes,
          traditions,
          traditionOther,
          dietary,
          budgetStyle,
          detailLevel,
        }),
      );
      announce("Saved. New events will use these answers.");
      showToast({ message: "Profile saved." });
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  const used = today ? aiUsedToday(profile, today) : 0;
  return (
    <>
      <Card className="flex items-center gap-3">
        <Avatar name={profile.displayName} photoURL={profile.photoURL} size={48} />
        <div className="grid">
          <b>{profile.displayName}</b>
          <span className="text-body-sm text-fg-muted">{profile.email} · from Google</span>
        </div>
      </Card>

      <Card>
        <form noValidate onSubmit={onSubmit} aria-labelledby="profile-title" className="grid gap-5">
          <h2 id="profile-title" className="m-0 text-h2 font-bold">
            Your profile
          </h2>
          <ErrorSummary ref={summaryRef} errors={summary} goal="save your profile" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="set-name"
              label="Name"
              autoComplete="name"
              maxLength={60}
              value={form.displayName}
              onChange={(e) => update("displayName", e.target.value)}
              error={errors.displayName}
            />
            <CityField id="set-city" value={form.homeCity} onChange={(v) => update("homeCity", v)} error={errors.homeCity} />
            <SelectField
              id="set-role"
              label="I usually plan"
              options={roleOptions}
              value={form.role ?? ""}
              onChange={(e) => update("role", (e.target.value || null) as ProfileRole | null)}
            />
            <LanguageField name="set-language" legend="AI language" value={form.language} onChange={(v) => update("language", v)} />
          </div>
          <EventTypeChips
            id="set-types"
            legend="Event types I plan"
            selected={form.eventTypes}
            onChange={(v) => update("eventTypes", v)}
            hint="Orders the event types in New event."
          />
          <TraditionFields
            id="set-traditions"
            legend="Traditions"
            selected={form.traditions}
            onChange={(v) => update("traditions", v)}
            other={form.traditionOther}
            onOtherChange={(v) => update("traditionOther", v)}
            otherError={errors.traditionOther}
          />
          <DietaryChips id="set-dietary" legend="Dietary" selected={form.dietary} onChange={(v) => update("dietary", v)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="set-budget"
              label="Budget comfort"
              options={budgetOptions}
              value={form.budgetStyle ?? ""}
              onChange={(e) => update("budgetStyle", (e.target.value || null) as BudgetStyle | null)}
            />
            <SelectField
              id="set-detail"
              label="Show me"
              options={detailOptions}
              value={form.detailLevel}
              onChange={(e) => update("detailLevel", e.target.value as UserProfile["detailLevel"])}
            />
          </div>
          <p className="m-0 text-[13px] text-fg-muted">These are defaults for new events. Existing events keep their own settings.</p>
          {saveError && (
            <Alert tone="danger" title="Couldn't save your profile.">
              Your changes are still here. Check your connection and try again.
            </Alert>
          )}
          <Button type="submit" loading={saving} className="justify-self-start">
            Save changes
          </Button>
        </form>
      </Card>

      <Card className="grid gap-3">
        <h2 className="m-0 text-h3 font-[650]">Account</h2>
        <div className="flex items-center justify-between gap-2 text-body-sm">
          <span>AI usage today</span>
          <b className="num">
            {used} of {AI_DAILY_QUOTA} suggestions
          </b>
        </div>
        <ProgressBar
          label="AI usage today"
          value={used}
          max={AI_DAILY_QUOTA}
          valueText={`${used} of ${AI_DAILY_QUOTA} suggestions used today`}
        />
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/onboarding?rerun=1" variant="secondary">
            Run onboarding again
          </ButtonLink>
          <Button variant="ghost" onClick={() => void auth.signOut().then(() => router.push("/"))}>
            Sign out
          </Button>
        </div>
      </Card>
    </>
  );
}
