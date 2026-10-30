"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useServices } from "@/components/data/ServicesProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { StagedProgress, type StageState } from "@/components/ui/Progress";
import { toCreateEventInput, type WizardForm } from "@/lib/client/eventWizard";
import { eventHref } from "@/lib/client/navigation";
import { ApiRequestError } from "@/lib/data/api";
import type { CreatedEvent } from "@/lib/data/eventsRepository";
import { isAbortError, wait } from "@/lib/data/wait";
import { createEventSchema, type PlanMode } from "@/lib/domain/model/createEvent";

/** How long the template-fallback stage stays on screen before the workspace opens. */
export const TEMPLATE_NOTICE_MS = 1_500;

type Stage = "drafting" | "template" | "checking" | "error";

/** The create request of one attempt, shared by every run of the effect for that attempt. */
interface CreateRun {
  attempt: number;
  controller: AbortController;
  created: Promise<CreatedEvent>;
  abortTimer?: ReturnType<typeof setTimeout>;
}

const RETRY_MESSAGE = "Your answers are still here. Check your connection and try again.";

/** The server's own words for a refusal it explains (the event limit, the daily AI quota); otherwise the retry hint. */
function failureMessage(error: unknown): string {
  return error instanceof ApiRequestError && error.status >= 400 && error.status < 500
    ? `Your answers are still here. ${error.message}`
    : RETRY_MESSAGE;
}

const STAGES: Record<Exclude<Stage, "error">, StageState[]> = {
  drafting: ["done", "active", "pending"],
  template: ["done", "failed", "done"],
  checking: ["done", "done", "active"],
};

/**
 * The generating card (spec 5.1, design-system 6.10): three stages announced politely and a Cancel
 * that aborts the request. When AI was unavailable the middle stage says the starter template was
 * used, briefly, before the workspace opens.
 */
export function GeneratingPanel({ form, mode, onCancelled }: { form: WizardForm; mode: PlanMode; onCancelled: () => void }) {
  const { events } = useServices();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("drafting");
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState(RETRY_MESSAGE);
  const run = useRef<CreateRun | null>(null);

  useEffect(() => {
    // One create request per attempt: when this effect runs again for the same attempt (React Strict
    // Mode mounts twice in development), it rejoins that request instead of sending another, which
    // the server would turn into a second event (QA-11). Leaving aborts it, one tick later, unless the
    // effect has run again by then.
    let current = run.current;
    if (current?.attempt === attempt && !current.controller.signal.aborted) {
      clearTimeout(current.abortTimer);
    } else {
      const controller = new AbortController();
      const request = createEventSchema.parse(toCreateEventInput(form, mode));
      current = { attempt, controller, created: events.create(request, controller.signal) };
      run.current = current;
    }
    const { controller, created } = current;
    let active = true;
    created
      .then(async ({ eventId, source }) => {
        if (!active) return;
        if (source === "template") {
          setStage("template");
          await wait(TEMPLATE_NOTICE_MS, controller.signal);
        } else {
          setStage("checking");
        }
        if (active) router.push(eventHref(eventId));
      })
      .catch((error: unknown) => {
        if (active && !isAbortError(error)) {
          setFailure(failureMessage(error));
          setStage("error");
        }
      });
    const leaving = current;
    return () => {
      active = false;
      leaving.abortTimer = setTimeout(() => controller.abort(), 0);
    };
  }, [events, form, mode, router, attempt]);

  if (stage === "error") {
    return (
      <Alert
        tone="danger"
        title="Couldn't create your plan."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setStage("drafting");
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancelled}>
              Edit answers
            </Button>
          </div>
        }
      >
        {failure}
      </Alert>
    );
  }

  const draftingLabel =
    stage === "template"
      ? "AI was unavailable. Using the starter template."
      : mode === "blank"
        ? "Setting up the starter plan"
        : "Drafting budget, timeline, vendors and ideas";
  const labels = ["Reading your details", draftingLabel, "Checking the numbers"];
  return (
    <StagedProgress
      title="Building your plan"
      stages={labels.map((label, i) => ({ label, state: STAGES[stage][i] }))}
      note={mode === "ai" ? "Usually under 30 seconds. If AI is unavailable, we start you from a starter template." : undefined}
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            run.current?.controller.abort();
            onCancelled();
          }}
        >
          Cancel
        </Button>
      }
    />
  );
}
