"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMediaQuery } from "@/components/data/useMediaQuery";
import { Alert } from "@/components/ui/Alert";
import { useAnnounce } from "@/components/ui/Announcer";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { Dialog } from "@/components/ui/Dialog";
import { FlameIcon } from "@/components/ui/icons";
import { TextareaField } from "@/components/ui/TextareaField";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { chipsFor, DEMO_RECORDED_CHIPS, TAB_LABELS } from "@/lib/client/workspace";
import { validPendingCount } from "@/lib/plan/proposals";
import { useAiSession, type RequestState } from "./AiSession";
import { ProposalBatch } from "./ProposalBatch";

const STAGES = ["Reading your plan", "Drafting suggestions", "Checking the numbers"] as const;
const STAGE_MS = 450;

/** Inline staged progress for an AI request (spec 3.4 Loading (AI)), with Cancel. */
export function AiProgress({ onCancel, label, focusOnMount = false }: { onCancel: () => void; label: string; focusOnMount?: boolean }) {
  const [stage, setStage] = useState(0);
  const labelRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), STAGE_MS);
    return () => clearInterval(timer);
  }, []);
  // The control that started the request is replaced by this card, so focus lands here (CO-01).
  useEffect(() => {
    if (focusOnMount) labelRef.current?.focus();
  }, [focusOnMount]);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-line bg-surface p-4">
      <p ref={labelRef} tabIndex={-1} className="m-0 text-body-sm font-semibold outline-none">
        {label}
      </p>
      <ol className="m-0 grid list-none gap-2 p-0 text-body-sm" aria-live="polite">
        {STAGES.map((text, i) => (
          <li key={text} className={cx("flex items-center gap-2", i === stage && "font-semibold", i > stage && "text-fg-muted")}>
            {i < stage ? (
              <Check size={16} className="text-success" aria-hidden="true" />
            ) : i === stage ? (
              <span className="spinner size-4 text-accent" aria-hidden="true" />
            ) : (
              <span className="size-4 rounded-full border border-line-strong" aria-hidden="true" />
            )}
            {text}
            <span className="sr-only">{i < stage ? " (done)" : i === stage ? " (in progress)" : " (waiting)"}</span>
          </li>
        ))}
      </ol>
      <Button variant="ghost" className="justify-self-start" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/** The failure states an AI request can end in (spec 3.4, 10.19). */
export function AiRequestAlert({
  state,
  onRetry,
  manualHref,
  manualLabel,
  onReset,
}: {
  state: RequestState;
  onRetry: () => void;
  manualHref?: string;
  manualLabel?: string;
  onReset?: () => void;
}) {
  if (state.status !== "error") return null;
  if (state.kind === "rate_limited") {
    return (
      <Alert tone="warning" title="You have used AI a lot in a short time.">
        Try again in {state.retryAfterMinutes || 1} minutes.
      </Alert>
    );
  }
  if (state.kind === "not_configured") {
    return (
      <Alert
        tone="warning"
        title="AI suggestions aren't available on this deployment."
        action={
          manualHref && (
            <Link href={manualHref} className="text-body-sm text-brand underline">
              {manualLabel}
            </Link>
          )
        }
      >
        Your plan is unchanged. You can still edit everything yourself.
      </Alert>
    );
  }
  if (state.kind === "sandbox_invalid") {
    return (
      <Alert
        tone="danger"
        title="This sample got out of step."
        action={
          onReset && (
            <Button variant="secondary" onClick={onReset}>
              Reset sample
            </Button>
          )
        }
      >
        Reset it to try again. Your changes here were not saved anywhere.
      </Alert>
    );
  }
  return (
    <Alert
      tone="danger"
      title="Could not get suggestions."
      action={
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
          {manualHref && (
            <Link href={manualHref} className="text-body-sm text-brand underline">
              {manualLabel}
            </Link>
          )}
        </div>
      }
    >
      Your plan is unchanged.
    </Alert>
  );
}

const MAX_CHARS = { workspace: 500, sample: 300 } as const;

function PanelBody({ titleId, onClose, onReset }: { titleId: string; onClose: () => void; onReset?: () => void }) {
  const { tab, tabHref, sample, plan, today, editable, workspace } = useWorkspace();
  const { draft, setDraft, turns, requests, askInstruct, cancel } = useAiSession();
  const announce = useAnnounce();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [lastAsked, setLastAsked] = useState("");
  const [arrived, setArrived] = useState<number | null>(null);
  const request = requests.instruct;
  const instructTurns = turns.filter((t) => t.kind === "instruct" && !t.restored);
  const current = instructTurns.at(-1);
  const earlier = instructTurns.slice(0, -1).slice(-4);
  // Suggestions from an earlier visit that were never decided (ideas show on the Ideas tab).
  const waiting = turns.filter((t) => t.restored && t.kind !== "ideas");
  const max = sample ? MAX_CHARS.sample : MAX_CHARS.workspace;
  const empty = draft.trim() === "";
  const hintId = useId();
  const noAiId = useId();
  // Without a model the panel says so up front instead of offering a Retry that can't work (MQW-07, CO-08).
  const aiOff = !sample && workspace.aiAvailable === false;
  // A sample with no live AI answers from recordings only, so it offers just those (MQR-03).
  const recordedOnly = Boolean(sample) && workspace.aiAvailable === false;
  const chips = sample && recordedOnly ? DEMO_RECORDED_CHIPS[sample] : chipsFor(tab, plan, sample ?? undefined);

  useEffect(() => textarea.current?.focus(), []);

  async function ask(text: string) {
    setLastAsked(text);
    const panel = textarea.current?.closest("[data-ai-panel]");
    const turn = await askInstruct(text);
    if (!turn) return;
    const valid = validPendingCount(plan, turn.proposal, today);
    // A reply with no cards is announced as an answer, not "0 suggestions, 0 valid" (MQR-03).
    announce(turn.proposal.items.length > 0 ? `${turn.proposal.items.length} suggestions, ${valid} valid` : "Answer ready");
    // Focus moves to the new batch unless the user went to work elsewhere meanwhile (spec R2-11).
    const active = document.activeElement;
    if (!active || active === document.body || panel?.contains(active)) setArrived(turn.id);
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!empty && !aiOff && request.status !== "loading") void ask(draft.trim());
  }

  return (
    <div data-ai-panel className="grid content-start grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex items-center gap-2">
        <FlameIcon className="text-warning" />
        <h2 id={titleId} className="m-0 text-h3 font-bold">
          {sample ? "Try AI mode" : "AI mode"}
        </h2>
        {sample && <Tag tone="neutral">Sandbox</Tag>}
        <span className="flex-1" />
        <Button variant="ghost" iconOnly aria-label="Close AI mode" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </Button>
      </div>
      {aiOff && (
        <p id={noAiId} className="m-0 rounded-md bg-surface-sunken px-3 py-2 text-body-sm">
          AI suggestions aren&apos;t available on this deployment. You can still change everything yourself on each tab
          {waiting.length > 0 ? ", and decide the suggestions waiting below" : ""}.
        </p>
      )}
      <form className="grid grid-cols-[minmax(0,1fr)] gap-2" onSubmit={submit}>
        <TextareaField
          id="ai-instruction"
          ref={textarea}
          label="Tell Utsav what to change"
          value={draft}
          maxLength={max}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span id={hintId} className="text-caption text-fg-muted">
            {recordedOnly
              ? "Live AI is off in this demo, so only the recorded examples below have answers."
              : empty
                ? "Type an instruction to get suggestions."
                : sample
                  ? "Live AI answers here; when it can't, recorded examples cover the first example."
                  : "Ctrl or ⌘ + Enter to send."}
          </span>
          <Button type="submit" disabled={empty || aiOff} loading={request.status === "loading"} aria-describedby={aiOff ? noAiId : hintId}>
            Suggest
          </Button>
        </div>
      </form>
      {!aiOff && (
        <div className="flex flex-wrap items-center gap-x-1.5" role="group" aria-label="Example instructions">
          <span className="text-caption text-fg-muted">Try:</span>
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setDraft(chip);
                textarea.current?.focus();
              }}
              className="inline-flex min-h-11 cursor-pointer items-center"
            >
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-pill bg-surface-sunken px-3 text-[13px] font-medium text-fg hover:bg-neutral-tint">
                <FlameIcon size={14} className="text-warning" />
                {chip}
              </span>
            </button>
          ))}
        </div>
      )}
      {request.status === "loading" && <AiProgress label="Getting suggestions" onCancel={() => cancel("instruct")} />}
      <AiRequestAlert
        state={request}
        onRetry={() => void ask(lastAsked)}
        manualHref={editable ? tabHref(tab) : undefined}
        manualLabel={`Edit ${TAB_LABELS[tab]} manually`}
        onReset={onReset}
      />
      {earlier.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 border-t border-line pt-3">
          {earlier.map((turn) => {
            const applied = turn.proposal.items.filter((i) => i.status === "accepted" || i.status === "edited").length;
            const declined = turn.proposal.items.filter((i) => i.status === "declined").length;
            return (
              <details key={turn.id} className="text-body-sm">
                <summary className="min-h-11 cursor-pointer py-2.5 font-semibold">
                  Earlier: &ldquo;{turn.proposal.instruction}&rdquo; · {applied} applied{declined > 0 ? `, ${declined} declined` : ""}
                </summary>
                <ul className="m-0 grid gap-1 pl-5">
                  {turn.proposal.items.map((item) => (
                    <li key={item.id}>
                      {item.summary} ({item.status})
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}
      {waiting.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-line pt-3">
          <p className="m-0 text-body-sm text-fg-muted">
            Waiting for your decision from earlier. They expire 24 hours after they were suggested.
          </p>
          {waiting.map((turn) => (
            <ProposalBatch key={turn.id} turn={turn} focusHeading={false} />
          ))}
        </div>
      )}
      {current && <ProposalBatch key={current.id} turn={current} focusHeading={arrived === current.id} />}
      {sample && <p className="m-0 text-caption text-fg-muted">Changes apply to this in-memory sample only. Nothing is saved.</p>}
    </div>
  );
}

/**
 * AI mode (spec 6.3, 10.7): a 400 px non-modal side panel from 1024 px, a full-screen modal sheet
 * below. Closing returns focus to the AI mode button (the header handles that).
 */
export function AiPanel({ onReset }: { onReset?: () => void }) {
  const { panelOpen, closePanel } = useAiSession();
  const wide = useMediaQuery("(min-width: 1024px)");
  const titleId = useId();
  if (!panelOpen) return null;
  if (wide) {
    return (
      <aside
        aria-labelledby={titleId}
        className="sticky top-0 max-h-dvh w-[400px] shrink-0 overflow-y-auto border-l border-line bg-surface p-5"
      >
        <PanelBody titleId={titleId} onClose={closePanel} onReset={onReset} />
      </aside>
    );
  }
  return (
    <Dialog open variant="sheet" title="AI mode" onClose={closePanel} labelledBy={titleId}>
      <PanelBody titleId={titleId} onClose={closePanel} onReset={onReset} />
    </Dialog>
  );
}
