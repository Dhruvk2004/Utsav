"use client";

import { Info, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Chip";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { acceptAllDecisions, acceptAllSummary, batchHeading, isApplied, skippedReasons, validPendingCount } from "@/lib/plan/proposals";
import type { RecordedReason } from "@/lib/demo/recordings";
import { useAiSession, type Turn } from "./AiSession";
import { SuggestionCard } from "./SuggestionCard";

/**
 * "Recorded example - live AI is busy" (spec 5.10): shown only when the answer came from a
 * recording, and it never says "busy" when the demo has no live AI at all (MQW-08).
 */
export function RecordedTag({ reason = "busy" }: { reason?: RecordedReason }) {
  return (
    <Tag tone="warning" icon={<Info aria-hidden="true" />}>
      {reason === "off" ? "Recorded example - live AI is off in this demo" : "Recorded example - live AI is busy"}
    </Tag>
  );
}

/**
 * One AI mode answer (spec 6.1, 10.7): the focusable heading, "Accept all valid", the cards and
 * any text answer. After Accept all, focus moves to the summary line with the batch's Undo.
 */
export function ProposalBatch({ turn, focusHeading }: { turn: Turn; focusHeading: boolean }) {
  const { plan, today, latestBatch, offline, undoing } = useWorkspace();
  const { decideItems, undoItem } = useAiSession();
  const heading = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<{ text: string; itemId: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const { proposal } = turn;
  const valid = validPendingCount(plan, proposal, today);

  useEffect(() => {
    if (focusHeading) heading.current?.focus();
  }, [focusHeading]);

  useEffect(() => {
    if (summary) summaryRef.current?.focus();
  }, [summary]);

  async function acceptAll() {
    setBusy(true);
    const skipped = skippedReasons(plan, proposal, today);
    const results = await decideItems(turn.id, acceptAllDecisions(plan, proposal, today));
    setBusy(false);
    setSummary({ text: acceptAllSummary(results, skipped), itemId: results.find((r) => r.ok)?.itemId ?? null });
  }

  const batchUndo = summary?.itemId ? turn.batches[summary.itemId] : undefined;

  return (
    <section aria-labelledby={`batch-${turn.id}`} className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
          <h2 id={`batch-${turn.id}`} ref={heading} tabIndex={-1} className="m-0 text-[17px] leading-snug font-bold">
            {batchHeading(proposal)}
          </h2>
          {proposal.items.length > 0 && <span className="text-body-sm text-fg-muted">{valid} valid</span>}
        </div>
        {!summary && valid > 1 && (
          <Button variant="secondary" loading={busy} disabled={offline} onClick={() => void acceptAll()}>
            Accept all valid ({valid})
          </Button>
        )}
      </div>
      {/* A reply with no cards is not a recorded example: it says itself why there is nothing (MQR-03). */}
      {turn.recorded && proposal.items.length > 0 && <RecordedTag reason={turn.recordedReason} />}
      {proposal.filtered && (
        <p className="m-0 text-caption text-fg-muted">
          Some details were removed: Utsav never adds phone numbers, links or business names.
        </p>
      )}
      {summary && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md bg-success-tint px-3 py-2 text-body-sm"
        >
          <span className="flex-1">{summary.text}</span>
          {batchUndo !== undefined && batchUndo === latestBatch && summary.itemId && (
            <Button
              variant="secondary"
              icon={<Undo2 size={16} aria-hidden="true" />}
              loading={undoing === batchUndo}
              disabled={offline}
              onClick={async () => {
                if (summary.itemId && (await undoItem(turn.id, summary.itemId))) {
                  setSummary(null);
                  // The summary line goes away with its Undo; focus returns to the batch (CO-01).
                  heading.current?.focus();
                }
              }}
            >
              Undo
            </Button>
          )}
        </div>
      )}
      {proposal.reply && (
        <article className="grid grid-cols-[minmax(0,1fr)] gap-1.5 rounded-lg bg-surface-sunken p-4 text-body-sm">
          <h3 className="m-0 text-body-sm font-bold">Answer</h3>
          <p className="m-0">{proposal.reply}</p>
        </article>
      )}
      {proposal.items.map((item, index) => (
        <SuggestionCard key={item.id} turn={turn} item={item} index={index} />
      ))}
      {proposal.items.length > 0 && proposal.items.every((i) => isApplied(i) || i.status === "declined") && !summary && (
        <p className="m-0 text-body-sm text-fg-muted">All suggestions in this batch are decided.</p>
      )}
    </section>
  );
}
