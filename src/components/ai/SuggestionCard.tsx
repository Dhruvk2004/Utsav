"use client";

import { Ban, Check, CircleAlert, Undo2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { DiffView } from "@/components/plan/DiffView";
import { IdeaFacts } from "@/components/plan/IdeaFacts";
import { OpEditor } from "@/components/plan/OpEditor";
import { Button } from "@/components/ui/Button";
import { AiSurface, OriginTag, Tag, type Origin } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { adjustedLine, followUpDiff } from "@/lib/client/followUp";
import { editFormFor } from "@/lib/client/opForms";
import { applyOperations } from "@/lib/domain/ops/apply";
import type { ProposalItem } from "@/lib/domain/model/records";
import { isApplied, previewItem } from "@/lib/plan/proposals";
import { replacesEarlier } from "@/lib/plan/replaceEarlier";
import { useAiSession, type Turn } from "./AiSession";

const ORIGIN_TAGS: Record<Turn["proposal"]["origin"], Origin> = { ai: "ai", library: "library", code: "utsav" };

type FocusTarget = "undo" | "restore" | "accept" | "edit" | "line" | "heading";

interface CardProps {
  turn: Turn;
  item: ProposalItem;
  index: number;
  /** Ideas read Save / Dismiss (spec 5.7); everything else Accept / Decline. */
  wording?: "accept" | "save";
  headingLevel?: 3 | 4;
  /** Focus the card heading on mount (a code proposal created by a button, design-system 6.5). */
  focusOnMount?: boolean;
}

/**
 * The AI suggestion card (design-system 6.5): a code-built title and diff from a live dry run
 * against the plan on screen, the model's short "Why", and Accept / Edit / Decline. Decided
 * cards collapse to one line with Undo or Restore, and focus moves there (spec 6.1, R2-11).
 */
export function SuggestionCard({ turn, item, index, wording = "accept", headingLevel = 3, focusOnMount = false }: CardProps) {
  // Offline, every decision is disabled like the tab's own controls (spec 3.4, QA-03).
  const { plan, today, latestBatch, offline, undoing } = useWorkspace();
  const { decideItems, undoItem, earlier } = useAiSession();
  const [editing, setEditing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  // The title as the user saw it when deciding; a follow-up's live title changes once it applies.
  const [decidedTitle, setDecidedTitle] = useState<string | null>(null);
  // Where focus goes after the next render (spec R2-11); a ref, so setting it never re-renders.
  const focusNext = useRef<FocusTarget | null>(focusOnMount ? "heading" : null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  const acceptRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const { proposal } = turn;
  const preview = useMemo(() => previewItem(plan, proposal, item, today), [plan, proposal, item, today]);

  // A budget change replaces an earlier AI change only by the server's rule (MQR-05): the
  // instruction says so ("instead", "make it …") and the line still holds that change's result.
  // "Rather …", or a line undone or edited by hand since, gets an ordinary card.
  const lineId = adjustedLine(item.op);
  const prior = lineId === null ? undefined : earlier[lineId];
  const replaces =
    prior !== undefined &&
    replacesEarlier(proposal.instruction) &&
    plan.budget.lines.some((l) => l.id === lineId && l.amount === prior.after);
  const original = replaces ? prior.before : null;
  const diff = useMemo(() => {
    if (original === null) return preview.diff;
    const run = applyOperations(plan, [item.op], { today, actor: "ai", proposalOrigin: proposal.origin });
    return followUpDiff(plan, run.results[0].ok ? run.plan : null, item.op, original) ?? preview.diff;
  }, [original, preview.diff, plan, item.op, today, proposal.origin]);

  useEffect(() => {
    const refs = { undo: undoRef, restore: restoreRef, accept: acceptRef, edit: editRef, line: lineRef, heading: headingRef };
    const element = focusNext.current && refs[focusNext.current].current;
    if (!element) return;
    element.focus();
    focusNext.current = null;
  });

  const words =
    wording === "save"
      ? { accept: "Save", decline: "Dismiss", applied: "Saved", declined: "Dismissed" }
      : { accept: "Accept", decline: "Decline", applied: "Applied", declined: "Declined" };
  const stale = item.status === "pending" && !preview.ok;
  const invalid = item.status === "invalid" || item.status === "expired" || stale;
  // A card that no longer applies keeps the title it was suggested with.
  const title = invalid ? item.summary : item.status === "pending" ? diff.title : (decidedTitle ?? diff.title);
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const setFocus = (target: FocusTarget) => {
    focusNext.current = target;
  };

  async function act(action: "accept" | "decline" | "restore") {
    setDecidedTitle(action === "restore" ? null : title);
    setBusy(true);
    const [result] = await decideItems(turn.id, [{ itemId: item.id, action }]);
    setBusy(false);
    if (result?.ok) setFocus(action === "accept" ? "undo" : action === "decline" ? "restore" : "accept");
  }

  if (dismissed) return null;

  if (isApplied(item)) {
    const batch = turn.batches[item.id];
    const canUndo = batch !== undefined && batch === latestBatch;
    return (
      <div
        ref={lineRef}
        tabIndex={-1}
        data-state="applied"
        className="motion-card-in flex min-h-11 flex-wrap items-center gap-2.5 rounded-md border border-line bg-success-tint px-3 py-1.5 text-body-sm"
      >
        <Check size={18} className="text-success" aria-hidden="true" />
        <span className="flex-1">
          <b>{words.applied}:</b> {item.status === "edited" ? `${title} (edited by you)` : title}
        </span>
        {canUndo ? (
          <Button
            ref={undoRef}
            variant="secondary"
            icon={<Undo2 size={16} aria-hidden="true" />}
            aria-label={`Undo: ${title}`}
            loading={undoing === batch}
            disabled={offline}
            onClick={async () => {
              // The card comes back undecided, so focus goes to its Accept (CO-01).
              if (await undoItem(turn.id, item.id)) {
                setDecidedTitle(null);
                setFocus("accept");
              }
            }}
          >
            Undo
          </Button>
        ) : (
          <span className="text-fg-muted">Undo unavailable: the plan changed after this.</span>
        )}
      </div>
    );
  }

  if (item.status === "declined") {
    return (
      <div
        data-state="declined"
        className="flex min-h-11 flex-wrap items-center gap-2.5 rounded-md border border-line px-3 py-1.5 text-body-sm text-fg-muted"
      >
        <span className="flex-1">
          {words.declined}: {title}
        </span>
        <Button
          ref={restoreRef}
          variant="ghost"
          aria-label={`Restore: ${title}`}
          loading={busy}
          disabled={offline}
          onClick={() => void act("restore")}
        >
          Restore
        </Button>
      </div>
    );
  }

  const form = invalid ? null : editFormFor(item.op, plan, today);
  const origin = ORIGIN_TAGS[proposal.origin];

  return (
    <AiSurface
      origin={origin === "utsav" ? "utsav" : "ai"}
      aria-labelledby={titleId}
      className={cx("motion-card-in", invalid && "bg-surface-sunken")}
      style={{ "--i": index } as CSSProperties}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {editing ? (
            <OriginTag origin="you" />
          ) : turn.recorded ? (
            <OriginTag origin={origin}>Recorded</OriginTag>
          ) : (
            <OriginTag origin={origin} />
          )}
          {replaces && (
            <Tag tone="neutral" icon={<Undo2 aria-hidden="true" />}>
              Replaces your earlier change
            </Tag>
          )}
        </div>
        {invalid ? (
          <Tag tone="danger" icon={<Ban aria-hidden="true" />}>
            {stale ? "No longer applies" : "Not valid"}
          </Tag>
        ) : (
          <Tag tone="success" icon={<Check aria-hidden="true" />}>
            Valid
          </Tag>
        )}
      </div>
      <Heading
        id={titleId}
        ref={headingRef}
        tabIndex={-1}
        className={cx("m-0 text-[17px] leading-snug font-semibold", invalid && "text-fg-muted")}
      >
        {title}
      </Heading>
      {invalid ? (
        <p className="m-0 flex items-start gap-1.5 text-body-sm text-danger">
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {stale ? `The plan changed since this was suggested. ${preview.reason ?? ""}` : (item.reason ?? preview.reason)}
        </p>
      ) : editing && form ? (
        <OpEditor
          form={form}
          submitLabel={`${words.accept === "Save" ? "Save" : "Save and accept"}`}
          preview={(op) => {
            const edited = previewItem(plan, proposal, item, today, op);
            return edited.ok ? <DiffView diff={edited.diff} /> : edited.reason;
          }}
          onCancel={() => {
            setEditing(false);
            setFocus("edit");
          }}
          onSubmit={async (op) => {
            // Edits are re-validated live; an edit that would not apply is never sent (spec 6.1).
            const check = previewItem(plan, proposal, item, today, op);
            if (!check.ok) return check.reason ?? "This change could not be applied.";
            // The applied line and its Undo name the edited change, not the model's title (MQW-05, BP-05).
            setDecidedTitle(check.diff.title);
            const [result] = await decideItems(turn.id, [{ itemId: item.id, action: "accept", editedOp: op }], { showsError: true });
            if (!result?.ok) return result?.reason ?? "This change could not be applied.";
            setEditing(false);
            setFocus("undo");
            return null;
          }}
        />
      ) : (
        <>
          {item.op.type === "add_idea" ? (
            <>
              {item.op.idea.description && <p className="m-0 text-body-sm">{item.op.idea.description}</p>}
              <IdeaFacts idea={item.op.idea} />
            </>
          ) : (
            <DiffView diff={diff} />
          )}
          {preview.alsoAdds.length > 0 && <p className="m-0 text-body-sm font-semibold">Also adds: {preview.alsoAdds.join("; ")}</p>}
        </>
      )}
      {item.rationale && !editing && (
        <p className="m-0 text-body-sm text-fg-muted">
          Why: <q>{item.rationale}</q>
        </p>
      )}
      {!editing && (
        <div className="flex flex-wrap gap-2">
          {invalid ? (
            <Button variant="ghost" aria-label={`Dismiss: ${title}`} onClick={() => setDismissed(true)}>
              Dismiss
            </Button>
          ) : (
            <>
              <Button
                ref={acceptRef}
                aria-label={`${words.accept}: ${title}`}
                loading={busy}
                disabled={offline}
                onClick={() => void act("accept")}
              >
                {words.accept}
              </Button>
              {form && (
                <Button ref={editRef} variant="secondary" aria-label={`Edit: ${title}`} disabled={offline} onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              <Button
                variant="ghost"
                aria-label={`${words.decline}: ${title}`}
                disabled={busy || offline}
                onClick={() => void act("decline")}
              >
                {words.decline}
              </Button>
            </>
          )}
        </div>
      )}
    </AiSurface>
  );
}
