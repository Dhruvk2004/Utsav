"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useAiSession } from "@/components/ai/AiSession";
import { SuggestionCard } from "@/components/ai/SuggestionCard";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Chip";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { reviewRows, type ReviewRow } from "@/lib/client/review";
import type { ReviewSection } from "@/lib/domain/model/enums";
import { isApplied } from "@/lib/plan/proposals";

const anchorOf = (section: ReviewSection) => `reset:${section}`;

/**
 * "Review your new plan" (spec 6.2): the one exception to card-by-card review. Each section can be
 * marked "Looks good" (no plan change) or reset to the starter template through a "Suggested by
 * Utsav" card shown in place; Ideas can also be saved at once. "Start from the starter template
 * instead" is offered only while nothing has changed since the plan was made.
 */
export function ReviewBanner({ onDismiss }: { onDismiss: () => void }) {
  const { plan, view, workspace, edit, track } = useWorkspace();
  const { turns, addTurn } = useAiSession();
  const [busy, setBusy] = useState(false);
  const review = workspace.review;
  const rows = reviewRows(plan, view);

  // An accepted reset card marks its section as reset.
  useEffect(() => {
    for (const row of rows) {
      const turn = turns.find((t) => t.anchor === anchorOf(row.section));
      if (row.state === "pending" && turn?.proposal.items.some(isApplied)) void review?.markReviewed(row.section, "reset");
    }
  }, [rows, turns, review]);

  if (!review || rows.length === 0) return null;

  async function requestReset(section: ReviewSection) {
    const proposal = await workspace.createProposal({
      touchpoint: "reset",
      origin: "code",
      instruction: "",
      items: [{ op: { type: "reset_section", section } }],
    });
    addTurn("code", proposal, anchorOf(section));
  }

  async function saveAllIdeas() {
    const suggested = plan.ideas.filter((idea) => idea.state === "suggested");
    const result = await edit(
      suggested.map((idea) => ({ type: "save_idea", ideaId: idea.id })),
      `Saved ${suggested.length} ideas`,
    );
    if (result.ok) await review?.markReviewed("ideas", "reviewed");
  }

  async function startFromTemplate() {
    setBusy(true);
    const result = await review?.startFromTemplate();
    if (result?.ok) track();
    setBusy(false);
  }

  const canRestore = review.canStartFromTemplate();
  return (
    <section
      aria-labelledby="review-heading"
      className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-l-4 border-line border-l-accent bg-[color-mix(in_srgb,var(--color-accent-tint)_50%,var(--color-surface))] p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="review-heading" className="m-0 text-h2 font-bold">
          Review your new plan
        </h2>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      <p className="m-0 text-body-sm text-fg-muted">
        Gemini drafted this plan and Utsav checked the numbers. Mark each part as reviewed, or reset it to the starter template.
        &ldquo;Reset section&rdquo; shows a before and after card first; nothing changes until you accept it.
      </p>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 @min-[720px]/workspace:grid-cols-2 @min-[1000px]/workspace:grid-cols-4">
        {rows.map((row) => (
          <SectionRow
            key={row.section}
            row={row}
            turn={turns.find((t) => t.anchor === anchorOf(row.section))}
            onReviewed={() => void review.markReviewed(row.section, "reviewed")}
            onReset={() => void requestReset(row.section)}
            onSaveAll={row.section === "ideas" && plan.ideas.some((i) => i.state === "suggested") ? () => void saveAllIdeas() : undefined}
          />
        ))}
      </ul>
      <div className="grid justify-items-start gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canRestore}
          loading={busy}
          aria-describedby={canRestore ? undefined : "restore-why"}
          onClick={() => void startFromTemplate()}
        >
          Start from the starter template instead
        </Button>
        {!canRestore && (
          <span id="restore-why" className="text-caption text-fg-muted">
            Not available after you&apos;ve changed the plan. Reset sections one at a time instead.
          </span>
        )}
      </div>
    </section>
  );
}

function SectionRow({
  row,
  turn,
  onReviewed,
  onReset,
  onSaveAll,
}: {
  row: ReviewRow;
  turn: ReturnType<typeof useAiSession>["turns"][number] | undefined;
  onReviewed: () => void;
  onReset: () => void;
  onSaveAll?: () => void;
}) {
  return (
    <li className="grid content-start grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border border-line bg-surface p-3.5">
      <span className="font-semibold">{row.label}</span>
      <span className="text-body-sm text-fg-muted">{row.summary}</span>
      {row.state === "pending" ? (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" aria-label={`Looks good: ${row.label}`} onClick={onReviewed}>
            Looks good
          </Button>
          {onSaveAll && (
            <Button size="sm" variant="secondary" onClick={onSaveAll}>
              Save all
            </Button>
          )}
          <Button size="sm" variant="ghost" aria-label={`Reset section: ${row.label}`} onClick={onReset}>
            Reset section
          </Button>
        </div>
      ) : (
        <Tag tone="success" icon={<Check aria-hidden="true" />}>
          {row.state === "reset" ? "Reset to the template" : "Reviewed"}
        </Tag>
      )}
      {turn?.proposal.items.map((item, i) => (
        <SuggestionCard key={`${turn.id}-${item.id}`} turn={turn} item={item} index={i} headingLevel={4} focusOnMount />
      ))}
    </li>
  );
}
