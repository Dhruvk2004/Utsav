"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AiProgress } from "@/components/ai/AiPanel";
import { useAiSession, type Turn } from "@/components/ai/AiSession";
import { SuggestionCard } from "@/components/ai/SuggestionCard";
import { Alert } from "@/components/ui/Alert";
import { useAnnounce } from "@/components/ui/Announcer";
import { Button } from "@/components/ui/Button";
import { ChipGroup, OriginTag, Tag } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { Dialog } from "@/components/ui/Dialog";
import { MoneyField } from "@/components/ui/MoneyField";
import { TextField } from "@/components/ui/Field";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { groupIndian, parseRupees } from "@/lib/client/money";
import {
  budgetLinesOp,
  editAfter,
  functionAmountsText,
  gapMessage,
  protectRows,
  rowsTotal,
  setIncluded,
  simpleRows,
  statusText,
  type WhatIfRow,
} from "@/lib/client/whatif";
import { isAbortError } from "@/lib/data/wait";
import { formatInr } from "@/lib/domain/budget";
import { moneyDelta } from "@/lib/domain/describe";
import { LIMITS } from "@/lib/domain/schemas";
import { CellInput } from "./CellInput";

type Option = "simple" | "smart";
type Smart =
  | { status: "idle" }
  | { status: "loading"; controller: AbortController }
  | { status: "failed" }
  | { status: "ready"; rows: WhatIfRow[]; ignored: string[]; notes: string[]; turn: Turn };

const validTotal = (n: number | null): n is number => n !== null && n >= LIMITS.minBudget && n <= LIMITS.maxBudget;

/**
 * What if the budget changes? (spec 6.4, 10.8): Simple rescale (code only) and Smart re-plan (AI
 * weights, code allocates) side by side, one diff table with an editable "After" per row and an
 * Include toggle, trade-off cards, and Apply disabled with the exact gap until the rows add up.
 */
export function WhatIfSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { plan, workspace, sample, edit } = useWorkspace();
  const { addTurn, turns } = useAiSession();
  const announce = useAnnounce();
  const [totalText, setTotalText] = useState(groupIndian(plan.budget.total));
  const [option, setOption] = useState<Option>("simple");
  const [protect, setProtect] = useState<string[]>([]);
  const [ask, setAsk] = useState("");
  const [smart, setSmart] = useState<Smart>({ status: "idle" });
  const [edited, setEdited] = useState<{ total: number; option: Option; protect: string; rows: WhatIfRow[] } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  // Where focus goes once a smart re-plan settles: the table when it is ready, the button when it failed (CO-01).
  // A ref, so setting it never re-renders by itself; the state change that settles the request does.
  const focusAfter = useRef<"table" | "generate" | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const generateRef = useRef<HTMLButtonElement>(null);
  const aiEnabled = workspace.aiAvailable !== false;

  const parsed = parseRupees(totalText);
  const newTotal = validTotal(parsed) ? parsed : null;
  const protectKey = protect.join(",");
  // Protect applies to both options (CO-03, MQW-03), including lines protected after a smart re-plan.
  const baseRows =
    newTotal === null
      ? []
      : option === "smart" && smart.status === "ready"
        ? protectRows(
            smart.rows.map((row) => ({ ...row, protected: protect.includes(row.lineId) })),
            newTotal,
          )
        : simpleRows(plan, newTotal, protect);
  const rows = edited && edited.total === newTotal && edited.option === option && edited.protect === protectKey ? edited.rows : baseRows;
  // The trade-off cards follow the session's copy of the turn, so a decision shows on the card at once.
  const tradeoffTurn = smart.status === "ready" ? (turns.find((t) => t.id === smart.turn.id) ?? smart.turn) : null;

  useEffect(() => {
    if (focusAfter.current === null) return;
    (focusAfter.current === "table" ? tableRef.current : generateRef.current)?.focus();
    focusAfter.current = null;
  });
  const gap = newTotal === null ? "Enter a new total to compare." : gapMessage(rows, newTotal);
  const factor = newTotal === null ? null : (newTotal / plan.budget.total).toFixed(2);

  function update(next: WhatIfRow[], changed: WhatIfRow) {
    if (newTotal === null) return;
    setEdited({ total: newTotal, option, protect: protectKey, rows: next });
    const moved = next.filter(
      (row) => row.lineId !== changed.lineId && rows.find((r) => r.lineId === row.lineId)?.after !== row.after,
    ).length;
    const after = next.find((row) => row.lineId === changed.lineId)?.after ?? 0;
    announce(
      `${changed.category} set to ${formatInr(after)}. ${moved} other ${moved === 1 ? "row" : "rows"} adjusted; total ${formatInr(rowsTotal(next))}.`,
    );
  }

  async function generate() {
    if (newTotal === null) return;
    const controller = new AbortController();
    setSmart({ status: "loading", controller });
    try {
      const result = await workspace.ai.whatif({ newTotal, protect, instruction: ask }, controller.signal);
      const turn = addTurn("whatif", result.tradeoffs);
      setSmart({ status: "ready", rows: result.rows, ignored: result.ignored, notes: result.notes, turn });
      setOption("smart");
      setEdited(null);
      announce(
        `Smart re-plan ready${result.tradeoffs.items.length > 0 ? ` with ${result.tradeoffs.items.length} trade-offs` : ""}. The table shows the new amounts.`,
      );
      focusAfter.current = "table";
    } catch (error) {
      // Any failure leaves Simple rescale selected and working (spec 6.4 fallback).
      setSmart({ status: isAbortError(error) ? "idle" : "failed" });
      setOption("simple");
      focusAfter.current = "generate";
    }
  }

  async function apply() {
    const result = await edit([budgetLinesOp(rows)], undefined, { showsError: true });
    if (result.ok) onClose();
    else setApplyError(result.reason ?? "This budget could not be applied.");
  }

  const delta = newTotal === null ? undefined : moneyDelta(plan.budget.total, newTotal);
  const fnText = newTotal === null ? null : functionAmountsText(plan, newTotal);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      wide
      title={sample ? "What if? (sample)" : "What if the budget changes?"}
      actions={
        <>
          {gap ? (
            <span id="whatif-gap" className="mr-auto text-body-sm text-fg-muted">
              {gap}
            </span>
          ) : (
            sample && <span className="mr-auto text-body-sm text-fg-muted">Sample only; reload resets.</span>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={gap !== null} aria-describedby={gap ? "whatif-gap" : undefined} onClick={() => void apply()}>
            {sample ? "Apply to sample" : "Apply selected"}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <MoneyField
          id="whatif-total"
          label="New total"
          value={totalText}
          onChange={setTotalText}
          className="w-48"
          error={parsed !== null && newTotal === null ? `Enter a total from ${formatInr(LIMITS.minBudget)}.` : undefined}
        />
        {delta && (
          <Tag tone={delta.tone === "less" ? "success" : "warning"} className="mb-3">
            <span aria-hidden="true">{delta.text}</span>
            <span className="sr-only">{delta.label}</span>
          </Tag>
        )}
      </div>
      {!sample && (
        <>
          <ChipGroup
            id="whatif-protect"
            legend="Protect (never decrease)"
            size="sm"
            options={plan.budget.lines.map((line) => ({ value: line.id, label: line.category }))}
            selected={protect}
            onToggle={(id) => setProtect((list) => (list.includes(id) ? list.filter((p) => p !== id) : [...list, id]))}
          />
          <TextField
            id="whatif-ask"
            label="Anything else?"
            optional
            value={ask}
            maxLength={200}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Keep the reception grand"
          />
        </>
      )}
      <div role="radiogroup" aria-label="How to re-plan" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <OptionCard
          checked={option === "simple"}
          onSelect={() => setOption("simple")}
          title="Simple rescale"
          tag={<Tag tone="neutral">Code only · instant</Tag>}
        >
          Every category × {factor ?? "…"}, rounded to whole rupees that still add up exactly.
          {protect.length > 0 ? " Protected categories keep at least their current amount." : ""}
          {sample ? " Smart re-plan is available after you sign in." : ""}
        </OptionCard>
        {!sample && (
          <OptionCard
            checked={option === "smart"}
            disabled={smart.status !== "ready"}
            onSelect={() => setOption("smart")}
            title="Smart re-plan"
            tag={<OriginTag origin="ai" />}
          >
            AI re-weights the categories; Utsav allocates exact rupees.{smart.status === "ready" ? " Ready." : ""}
          </OptionCard>
        )}
      </div>
      {!sample && smart.status !== "loading" && (
        <Button
          ref={generateRef}
          variant="secondary"
          className="justify-self-start"
          disabled={newTotal === null || !aiEnabled}
          aria-describedby={aiEnabled ? undefined : "whatif-no-ai"}
          onClick={() => void generate()}
        >
          {smart.status === "ready" ? "Regenerate" : "Generate smart re-plan"}
        </Button>
      )}
      {!sample && !aiEnabled && (
        <p id="whatif-no-ai" className="m-0 text-body-sm text-fg-muted">
          AI isn&apos;t available on this deployment, so Smart re-plan is off. Simple rescale and your own edits still work.
        </p>
      )}
      {smart.status === "loading" && <AiProgress label="Re-planning the budget" focusOnMount onCancel={() => smart.controller.abort()} />}
      {smart.status === "failed" && (
        <Alert tone="warning" title="Smart re-plan is unavailable right now.">
          Simple rescale still works.
        </Alert>
      )}
      {newTotal !== null && (
        // min-h-max: a scroll box's automatic minimum height is 0 (MQW-04); the sheet body's rows size to content (MQR-01).
        <div
          ref={tableRef}
          role="region"
          tabIndex={0}
          aria-label="Budget before and after"
          className="relative min-h-max overflow-x-auto rounded-md border border-line"
        >
          <table className="num w-full min-w-[600px] border-collapse text-body-sm">
            <thead className="bg-surface-sunken text-caption text-fg-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">
                  <span className="sr-only">Include</span>
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Category
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Before
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  After
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Change
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const change = moneyDelta(row.before, row.after);
                const status = statusText(row);
                return (
                  <tr key={row.lineId} className={cx("border-t border-line", row.status === "adjusted" && "motion-highlight")}>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        aria-label={`Include ${row.category}`}
                        className="size-5 accent-brand"
                        checked={row.included}
                        onChange={(e) => newTotal !== null && update(setIncluded(rows, row.lineId, e.target.checked, newTotal), row)}
                      />
                    </td>
                    <th scope="row" className="px-3 py-1.5 text-left font-semibold">
                      {row.category} {row.ai && <OriginTag origin="ai">AI</OriginTag>}
                    </th>
                    <td className="px-3 py-1.5 text-right text-fg-muted">{formatInr(row.before)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <CellInput
                        kind="money"
                        value={row.after}
                        label={`${row.category}, amount after`}
                        onCommit={(amount) => newTotal !== null && update(editAfter(rows, row.lineId, amount, newTotal), row)}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {change ? (
                        <>
                          <span aria-hidden="true">{change.text}</span>
                          <span className="sr-only">{change.label}</span>
                        </>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {status && (
                        <span className={cx("text-caption font-semibold", row.after < row.committed ? "text-danger" : "text-fg-muted")}>
                          {status}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-line font-bold">
                <td />
                <th scope="row" className="px-3 py-2 text-left">
                  Total
                </th>
                <td className="px-3 py-2 text-right">{formatInr(plan.budget.total)}</td>
                <td className="px-3 py-2 text-right">{formatInr(rowsTotal(rows))}</td>
                <td className="px-3 py-2 text-right">{moneyDelta(plan.budget.total, rowsTotal(rows))?.text ?? "0"}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {option === "smart" && smart.status === "ready" && (
        <>
          {smart.ignored.map((category) => (
            <p key={category} className="m-0 text-body-sm text-fg-muted">
              Ignored &ldquo;{category}&rdquo;: not a category in this plan. Add it from the Budget tab first.
            </p>
          ))}
          {smart.notes.length > 0 && (
            <ul className="m-0 grid gap-1 pl-5 text-body-sm">
              {smart.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {fnText && <p className="m-0 text-body-sm text-fg-muted">Function amounts will follow their shares: {fnText}</p>}
      {rows.some((row) => row.after < row.committed) && option === "simple" && (
        <Alert tone="warning" title="Some categories would go below what is already booked.">
          Smart re-plan protects commitments, or edit those rows.
        </Alert>
      )}
      {option === "smart" && tradeoffTurn && tradeoffTurn.proposal.items.length > 0 && (
        <section aria-labelledby="tradeoffs-heading" className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <h3 id="tradeoffs-heading" className="m-0 text-h3 font-[650]">
            Trade-offs
          </h3>
          {tradeoffTurn.proposal.items.map((item, i) => (
            <SuggestionCard key={item.id} turn={tradeoffTurn} item={item} index={i} headingLevel={4} />
          ))}
        </section>
      )}
      {applyError && (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {applyError}
        </p>
      )}
    </Dialog>
  );
}

function OptionCard({
  checked,
  disabled,
  onSelect,
  title,
  tag,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  tag: ReactNode;
  children: ReactNode;
}) {
  return (
    <label
      className={cx(
        "grid cursor-pointer gap-1.5 rounded-lg border-[1.5px] border-line-strong bg-surface p-4 has-checked:border-2 has-checked:border-brand has-checked:bg-brand-tint has-focus-visible:outline-2 has-focus-visible:outline-(--u-focus)",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="flex flex-wrap items-center gap-2">
        <input
          type="radio"
          name="whatif-option"
          className="size-5 accent-brand"
          checked={checked}
          disabled={disabled}
          onChange={onSelect}
        />
        <b>{title}</b>
        <span className="ml-auto">{tag}</span>
      </span>
      <span className="text-body-sm text-fg-muted">{children}</span>
    </label>
  );
}
