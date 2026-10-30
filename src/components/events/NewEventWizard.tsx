"use client";

import { ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServices } from "@/components/data/ServicesProvider";
import { useAsync } from "@/components/data/useAsync";
import { useToday } from "@/components/data/useToday";
import { PageColumn } from "@/components/shell/Main";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ErrorSummary } from "@/components/ui/ErrorSummary";
import { FlameIcon } from "@/components/ui/icons";
import { StepIndicator } from "@/components/ui/Progress";
import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";
import {
  firstStepWithIssues,
  newWizardForm,
  WIZARD_STEPS,
  wizardIssues,
  type WizardForm,
  type WizardIssue,
  type WizardStep,
} from "@/lib/client/eventWizard";
import { OCCASIONS, type Occasion } from "@/lib/domain/model/enums";
import type { PlanMode } from "@/lib/domain/model/createEvent";
import type { UserProfile } from "@/lib/domain/model/user";
import { EVENT_TYPES, type EventType } from "@/lib/domain/schemas";
import { BasicsStep } from "./BasicsStep";
import { GeneratingPanel } from "./GeneratingPanel";
import { ShapeStep } from "./ShapeStep";
import { WhoStep } from "./WhoStep";

const asEventType = (v: string | null) => ((EVENT_TYPES as readonly string[]).includes(v ?? "") ? (v as EventType) : undefined);
const asOccasion = (v: string | null) => ((OCCASIONS as readonly string[]).includes(v ?? "") ? (v as Occasion) : undefined);

/** New event (spec 5.1): loads the profile for defaults, then runs the three-step wizard. */
export function NewEventWizard() {
  const { profiles } = useServices();
  const load = useCallback((signal: AbortSignal) => profiles.load(signal), [profiles]);
  const { state } = useAsync(load);
  if (state.status === "loading") {
    return (
      <PageColumn>
        <SkeletonRegion label="Loading the event form" className="mx-auto grid max-w-[860px] gap-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </SkeletonRegion>
      </PageColumn>
    );
  }
  // Without a profile the wizard still works; it just starts with no defaults.
  return <WizardFlow profile={state.status === "ready" ? state.data : null} />;
}

type Phase = { kind: "form" } | { kind: "generating"; mode: PlanMode; form: WizardForm };

export function WizardFlow({ profile }: { profile: UserProfile | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const today = useToday();
  const [form, setForm] = useState(() =>
    newWizardForm(profile, { eventType: asEventType(params.get("type")), occasion: asOccasion(params.get("occasion")) }),
  );
  const [reached, setReached] = useState<WizardStep>(1);
  // The summary is a snapshot from the last Next or Create; inline messages stay live once a step was attempted.
  const [summary, setSummary] = useState<WizardIssue[]>([]);
  const [attempted, setAttempted] = useState<ReadonlySet<WizardStep>>(new Set());
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [notice, setNotice] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef<WizardStep | null>(null);

  // The step lives in ?step= so the browser's Back button moves between steps; a step that has not
  // been reached yet (e.g. a bookmarked ?step=3) shows the furthest reached step instead.
  const requested = Number(params.get("step")) as WizardStep;
  const step: WizardStep = requested >= 1 && requested <= reached ? requested : 1;

  useEffect(() => {
    if (shownStep.current !== null && shownStep.current !== step) headingRef.current?.focus();
    shownStep.current = step;
  }, [step]);

  const live = today && attempted.has(step) ? wizardIssues(form, today, step) : [];
  const errors = Object.fromEntries(live.map((i) => [i.id, i.message]));

  function showIssues(at: WizardStep, found: WizardIssue[]) {
    setAttempted((set) => new Set(set).add(at));
    setSummary(found);
    if (found.length) requestAnimationFrame(() => summaryRef.current?.focus());
  }

  function next() {
    if (!today) return;
    const found = wizardIssues(form, today, step);
    showIssues(step, found);
    if (found.length) return;
    const to = (step + 1) as WizardStep;
    setReached((r) => (r < to ? to : r));
    router.push(`/events/new?step=${to}`, { scroll: false });
  }

  function submit(mode: PlanMode) {
    if (!today) return;
    const failing = firstStepWithIssues(form, today);
    if (failing) {
      showIssues(failing, wizardIssues(form, today, failing));
      if (failing !== step) router.push(`/events/new?step=${failing}`, { scroll: false });
      return;
    }
    setNotice(null);
    setPhase({ kind: "generating", mode, form });
  }

  if (phase.kind === "generating" && today) {
    return (
      <PageColumn>
        <GeneratingPanel
          form={phase.form}
          mode={phase.mode}
          onCancelled={() => {
            setPhase({ kind: "form" });
            setNotice("Plan creation cancelled. Your answers are still here.");
          }}
        />
      </PageColumn>
    );
  }

  const stepProps = { form, setForm, errors, today };
  return (
    <PageColumn narrow className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 font-display text-h1 font-semibold">New event</h1>
        <StepIndicator label="New event steps" steps={WIZARD_STEPS.map((s) => s.label)} current={step - 1} />
      </div>
      {notice && <Alert tone="neutral" title={notice} />}
      <form
        noValidate
        aria-labelledby="wizard-step-title"
        className="grid gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 3) next();
          else submit("ai");
        }}
      >
        <h2 id="wizard-step-title" ref={headingRef} tabIndex={-1} className="m-0 text-h2 font-bold outline-none">
          Step {step} of 3: {WIZARD_STEPS[step - 1].label}
        </h2>
        <ErrorSummary ref={summaryRef} errors={summary} />
        <div key={step} className="motion-step-next grid gap-6">
          {step === 1 && <BasicsStep {...stepProps} preferredTypes={profile?.eventTypes ?? []} />}
          {step === 2 && <ShapeStep {...stepProps} />}
          {step === 3 && <WhoStep {...stepProps} />}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">
          {step === 1 ? (
            <ButtonLink href="/dashboard" variant="ghost">
              Cancel
            </ButtonLink>
          ) : (
            <Button
              variant="ghost"
              onClick={() => {
                setSummary([]);
                router.back();
              }}
            >
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button type="submit" disabled={!today}>
              Next: {WIZARD_STEPS[step].label}
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => submit("blank")} disabled={!today}>
                Create a blank plan
              </Button>
              <Button type="submit" disabled={!today} icon={<FlameIcon size={16} className="text-accent" />}>
                Create my plan
              </Button>
            </>
          )}
        </div>
      </form>
    </PageColumn>
  );
}
