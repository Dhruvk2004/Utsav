"use client";

import { ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServices } from "@/components/data/ServicesProvider";
import { useAsync } from "@/components/data/useAsync";
import { CityField, DietaryChips, EventTypeChips, LanguageField, RoleCards, TraditionFields } from "@/components/profile/ProfileFields";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChipRadioGroup, Tag } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { ErrorSummary, type SummaryError } from "@/components/ui/ErrorSummary";
import { TextField } from "@/components/ui/Field";
import { ProgressBar, StepIndicator } from "@/components/ui/Progress";
import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";
import { profileFieldErrors } from "@/lib/client/profileForm";
import { BUDGET_STYLE_LABELS, DETAIL_LEVEL_LABELS } from "@/lib/domain/labels";
import { BUDGET_STYLES, DETAIL_LEVELS } from "@/lib/domain/model/enums";
import type { ProfilePatch, UserProfile } from "@/lib/domain/model/user";
import { OnboardingDone } from "./OnboardingDone";

/**
 * Onboarding (spec 4): four short steps, each saved on Continue so closing the tab loses nothing.
 * Steps 2 to 4 can be skipped; Back keeps answers. `?rerun=1` pre-fills saved answers and returns
 * to Settings at the end, and never clears `onboardedAt`. The step lives in `?step=` like the event
 * wizard's, so the browser's Back button moves between steps instead of leaving (BP-06).
 */
export function OnboardingWizard() {
  const { profiles } = useServices();
  const rerun = useSearchParams().get("rerun") === "1";
  const load = useCallback((signal: AbortSignal) => profiles.load(signal), [profiles]);
  const { state, retry } = useAsync(load);

  if (state.status === "loading") {
    return (
      <SkeletonRegion
        label="Loading your profile"
        className="mx-auto grid w-full max-w-[600px] gap-4 rounded-xl border border-line bg-surface p-8"
      >
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </SkeletonRegion>
    );
  }
  if (state.status === "error") {
    return (
      <Alert
        tone="danger"
        title="Couldn't load your profile."
        action={
          <Button variant="secondary" size="sm" onClick={retry}>
            Retry
          </Button>
        }
      >
        Check your connection and try again.
      </Alert>
    );
  }
  return <OnboardingFlow profile={state.data} rerun={rerun} />;
}

type Step = 1 | 2 | 3 | 4;
const STEP_NAMES = ["About you", "What you plan", "Traditions and food", "Planning style"] as const;

const asStep = (value: string | null): Step | null => {
  const n = Number(value);
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
};

export function OnboardingFlow({ profile, rerun }: { profile: UserProfile; rerun: boolean }) {
  const { profiles } = useServices();
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState(profile);
  // Steps reached in this visit; a bookmarked ?step=4 shows the furthest reached step instead.
  const [reached, setReached] = useState<Step>(1);
  const [done, setDone] = useState(false);
  // The shown step changes at once on Continue; the URL catches up a moment later. Only a change
  // of the URL itself (the browser's Back or Forward) moves the step from there.
  const urlStep = asStep(params.get("step")) ?? 1;
  const [current, setCurrent] = useState<Step>(1);
  const [seenUrlStep, setSeenUrlStep] = useState(urlStep);
  if (seenUrlStep !== urlStep) {
    setSeenUrlStep(urlStep);
    setCurrent(urlStep <= reached ? urlStep : reached);
  }
  const step: Step | "done" = done ? "done" : current;
  const [direction, setDirection] = useState<"next" | "back">("next");
  // Inline messages stay live after the first Continue; the summary is a snapshot from that press.
  const [checked, setChecked] = useState(false);
  const [summary, setSummary] = useState<SummaryError[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState<(() => void) | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  // Focus follows the step heading as soon as the step changes (M7), but not on first load.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
    moved.current = true;
  }, [step]);

  const errors = checked ? profileFieldErrors(form) : {};
  const update = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setForm((f) => ({ ...f, [key]: value }));

  function go(to: Step | "done", dir: "next" | "back") {
    setDirection(dir);
    setSaveFailed(null);
    if (to === "done") {
      setDone(true);
      return;
    }
    setDone(false);
    setReached((r) => (r < to ? to : r));
    setCurrent(to);
    router.push(`/onboarding?${new URLSearchParams({ ...(rerun ? { rerun: "1" } : {}), step: String(to) })}`, { scroll: false });
  }

  function back() {
    setDirection("back");
    setSaveFailed(null);
    router.back();
  }

  async function save(patch: ProfilePatch, then: Step | "done") {
    setSaving(true);
    setSaveFailed(null);
    try {
      await profiles.save(patch);
      go(then, "next");
    } catch {
      setSaveFailed(() => () => void save(patch, then));
    } finally {
      setSaving(false);
    }
  }

  function continueFrom(current: Step) {
    if (current === 1) {
      const found = profileFieldErrors({ displayName: form.displayName, homeCity: form.homeCity });
      setChecked(true);
      const list: SummaryError[] = [
        found.displayName && { id: "ob-name", label: "Your name", message: found.displayName },
        found.homeCity && { id: "ob-city", label: "Home city", message: found.homeCity },
      ].filter((e): e is SummaryError => Boolean(e));
      setSummary(list);
      if (list.length) {
        requestAnimationFrame(() => summaryRef.current?.focus());
        return;
      }
      return void save({ displayName: form.displayName, homeCity: form.homeCity, language: form.language }, 2);
    }
    if (current === 2) return void save({ role: form.role, eventTypes: form.eventTypes }, 3);
    if (current === 3) {
      setChecked(true);
      if (profileFieldErrors({ traditions: form.traditions, traditionOther: form.traditionOther }).traditionOther) return;
      return void save({ traditions: form.traditions, traditionOther: form.traditionOther, dietary: form.dietary }, 4);
    }
    void save({ budgetStyle: form.budgetStyle, detailLevel: form.detailLevel, markOnboarded: true }, "done");
  }

  function skip(current: Step) {
    if (current === 4) void save({ markOnboarded: true }, "done");
    else go((current + 1) as Step, "next");
  }

  if (step === "done") return <OnboardingDone profile={form} rerun={rerun} onEdit={() => go(1, "back")} />;

  const firstName = form.displayName.split(" ")[0];
  return (
    <section aria-labelledby="ob-heading" className="mx-auto w-full max-w-[600px] rounded-xl border border-line bg-surface shadow-2">
      <ProgressBar thin className="rounded-t-xl" label="Onboarding progress" value={step} max={4} valueText={`Step ${step} of 4`} />
      <div key={step} className={cx("grid gap-5 px-5 py-7 sm:px-8", direction === "next" ? "motion-step-next" : "motion-step-back")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StepIndicator label="Onboarding steps" steps={STEP_NAMES} current={step - 1} showAllLabels={false} />
          <span className="flex items-center gap-2 text-body-sm font-semibold text-fg-muted">
            {rerun && <Tag tone="neutral">Updating your profile</Tag>}
            Step {step} of 4
          </span>
        </div>
        <h1
          id="ob-heading"
          ref={headingRef}
          tabIndex={-1}
          className="m-0 font-display text-[1.625rem] leading-tight font-semibold outline-none sm:text-[2rem]"
        >
          {step === 1 && (firstName ? `Welcome, ${firstName}. Let's set you up.` : "Welcome. Let's set you up.")}
          {step === 2 && "What do you usually plan?"}
          {step === 3 && (
            <>
              Traditions and food <span className="font-sans text-[15px] font-medium text-fg-muted">optional</span>
            </>
          )}
          {step === 4 && "How do you like to plan?"}
        </h1>

        {step === 1 && (
          <>
            <ErrorSummary ref={summaryRef} errors={summary} />
            <TextField
              id="ob-name"
              label="Your name"
              autoComplete="name"
              value={form.displayName}
              onChange={(e) => update("displayName", e.target.value)}
              error={errors.displayName}
              hint="From your Google account. You can change it."
              maxLength={60}
            />
            <CityField
              id="ob-city"
              value={form.homeCity}
              onChange={(v) => update("homeCity", v)}
              error={errors.homeCity}
              why="We use your city as the default for new events and for realistic cost ranges."
            />
            <LanguageField
              name="ob-language"
              legend="Language for AI suggestions"
              value={form.language}
              onChange={(v) => update("language", v)}
            />
          </>
        )}
        {step === 2 && (
          <>
            <RoleCards legend="Choose the one that fits best" value={form.role} onChange={(v) => update("role", v)} />
            <EventTypeChips
              id="ob-types"
              selected={form.eventTypes}
              onChange={(v) => update("eventTypes", v)}
              hint="Why we ask: so we show the most useful event types first."
            />
          </>
        )}
        {step === 3 && (
          <>
            <TraditionFields
              id="ob-traditions"
              selected={form.traditions}
              onChange={(v) => update("traditions", v)}
              other={form.traditionOther}
              onOtherChange={(v) => update("traditionOther", v)}
              otherError={errors.traditionOther}
            />
            <DietaryChips id="ob-dietary" selected={form.dietary} onChange={(v) => update("dietary", v)} />
            <p className="m-0 text-[13px] text-fg-muted">
              Why we ask: to suggest rituals, menus and decor that fit your celebrations. You can change this per event.
            </p>
          </>
        )}
        {step === 4 && (
          <>
            <ChipRadioGroup
              name="ob-budget"
              legend="Budget comfort"
              value={form.budgetStyle}
              onChange={(v) => update("budgetStyle", v)}
              options={BUDGET_STYLES.map((b) => ({ value: b, label: BUDGET_STYLE_LABELS[b] }))}
            />
            <ChipRadioGroup
              name="ob-detail"
              legend="Show me"
              value={form.detailLevel}
              onChange={(v) => update("detailLevel", v)}
              options={DETAIL_LEVELS.map((d) => ({ value: d, label: DETAIL_LEVEL_LABELS[d] }))}
            />
            <p className="m-0 text-[13px] text-fg-muted">Why we ask: so suggestions match how much you want to spend and see.</p>
          </>
        )}
        {saveFailed && (
          <Alert
            tone="danger"
            title="Couldn't save this step."
            action={
              <Button variant="secondary" size="sm" onClick={saveFailed}>
                Retry
              </Button>
            }
          >
            Your answers are still here. Check your connection and try again.
          </Alert>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-b-xl border-t border-line bg-surface-sunken px-5 py-4 sm:px-8">
        {step > 1 && (
          <Button variant="ghost" onClick={back}>
            Back
          </Button>
        )}
        <span className="flex-1" />
        {rerun && (
          <ButtonLink href="/settings" variant="ghost">
            Cancel and return to Settings
          </ButtonLink>
        )}
        {step > 1 && (
          <Button variant="ghost" onClick={() => skip(step)} disabled={saving}>
            Skip for now
          </Button>
        )}
        <Button onClick={() => continueFrom(step)} loading={saving}>
          {step < 4 ? "Continue" : "Finish"}
          {step < 4 && <ArrowRight size={16} aria-hidden="true" />}
        </Button>
      </div>
    </section>
  );
}
