"use client";

import { ArrowLeftRight, CircleAlert, Lock } from "lucide-react";
import { useState } from "react";
import { useMediaQuery } from "@/components/data/useMediaQuery";
import { CellInput } from "@/components/plan/CellInput";
import { OriginTag, Tag } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { amountEditOp, amountForPercent, budgetRows, totalsOf, type BudgetRow, type RebalanceMode } from "@/lib/client/budgetTable";
import { adjustedIds } from "@/lib/domain/announce";
import { formatInr } from "@/lib/domain/budget";
import { useWorkspace } from "../WorkspaceContext";
import { RowActions, RowDialogView, type RowDialog } from "./BudgetRowDialogs";

/** Header cell style shared by the budget tables. */
export const th = "px-3 py-2 font-semibold";

function Variance({ row }: { row: BudgetRow }) {
  return row.variance < 0 ? (
    <span className="inline-flex items-center gap-1 font-semibold text-danger">
      <CircleAlert size={16} aria-hidden="true" />
      Over by {formatInr(-row.variance)}
    </span>
  ) : (
    <>{formatInr(row.variance)}</>
  );
}

type Marks = { edited: string; adjusted: string[] } | null;

/**
 * Budget by category on a phone (design.html #p-mobile, D-08, BP-04): one card per category with the
 * amount input and actions in view, and committed, paid and the note behind a Details expander,
 * instead of a 760 px table scrolling sideways.
 */
function CategoryCards({
  rows,
  marks,
  save,
  onOpen,
}: {
  rows: BudgetRow[];
  marks: Marks;
  save: (row: BudgetRow, amount: number) => Promise<true | string>;
  onOpen: (dialog: RowDialog) => void;
}) {
  const { plan, editable } = useWorkspace();
  const totals = totalsOf(rows);
  return (
    <section aria-label="Budget by category" className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {rows.map((row) => {
          const adjusted = marks?.adjusted.includes(row.id);
          return (
            <li
              key={row.id}
              className={cx(
                "grid grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border border-line bg-surface p-3",
                adjusted && "motion-highlight",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="m-0 text-body font-semibold">{row.category}</h3>
                <span className="flex flex-wrap gap-1.5">
                  {adjusted && (
                    <Tag tone="warning" icon={<ArrowLeftRight aria-hidden="true" />}>
                      Adjusted
                    </Tag>
                  )}
                  {marks?.edited === row.id && <OriginTag origin="you" />}
                  {row.isContingency && (
                    <Tag tone="neutral" icon={<Lock aria-hidden="true" />}>
                      Always kept
                    </Tag>
                  )}
                </span>
              </div>
              <div className="flex items-start gap-2">
                {editable ? (
                  <CellInput
                    kind="money"
                    value={row.amount}
                    label={`${row.category}, allocated amount`}
                    onCommit={(amount) => save(row, amount)}
                    className="flex-1"
                  />
                ) : (
                  <span className="num flex-1 font-semibold">{formatInr(row.amount)}</span>
                )}
                {editable && <RowActions row={row} onOpen={onOpen} />}
              </div>
              <span className="num text-caption text-fg-muted">
                {row.percent.toFixed(1)}% · {row.variance < 0 ? <Variance row={row} /> : `variance ${formatInr(row.variance)}`}
              </span>
              <details className="text-body-sm">
                <summary className="min-h-11 cursor-pointer py-2.5 font-semibold">
                  Details<span className="sr-only"> for {row.category}</span>
                </summary>
                <dl className="num m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-line pt-2">
                  {editable && (
                    <>
                      <dt className="text-fg-muted">Percent</dt>
                      <dd className="m-0">
                        <CellInput
                          kind="percent"
                          value={row.percent}
                          label={`${row.category}, percent`}
                          onCommit={(p) => save(row, amountForPercent(p, plan.budget.total))}
                        />
                      </dd>
                    </>
                  )}
                  <dt className="text-fg-muted">Committed</dt>
                  <dd className="m-0">{formatInr(row.committed)}</dd>
                  <dt className="text-fg-muted">Paid</dt>
                  <dd className="m-0">{formatInr(row.paid)}</dd>
                  <dt className="text-fg-muted">Note</dt>
                  <dd className="m-0">
                    {row.note || "None"} {row.note && row.origin === "ai" && <OriginTag origin="ai">AI</OriginTag>}
                  </dd>
                </dl>
              </details>
            </li>
          );
        })}
      </ul>
      <p className="num m-0 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-line bg-surface px-3 py-2 text-body-sm font-semibold">
        <span>Total {formatInr(totals.amount)}</span>
        <span>Committed {formatInr(totals.committed)}</span>
        <span>Paid {formatInr(totals.paid)}</span>
      </p>
    </section>
  );
}

/** Budget by category (spec 5.4, 10.8): linked % and ₹ cells, Adjusted tags after a rebalance, row menu. */
export function CategoryTable({ mode }: { mode: RebalanceMode }) {
  const { plan, view, editable, edit } = useWorkspace();
  const [marks, setMarks] = useState<Marks>(null);
  const [dialog, setDialog] = useState<RowDialog>(null);
  const phone = useMediaQuery("(max-width: 639px)");
  const rows = budgetRows(plan, view);
  const totals = totalsOf(rows);

  /** Resolves to true, or the reason the change was refused (the cell shows it, CO-06). */
  async function save(row: BudgetRow, amount: number): Promise<true | string> {
    const before = plan;
    const result = await edit([amountEditOp(row.id, amount, mode)], undefined, { showsError: true });
    setMarks(result.ok ? { edited: row.id, adjusted: adjustedIds(before, result.plan, row.id) } : null);
    return result.ok ? true : (result.reason ?? "This change could not be saved.");
  }

  if (phone) {
    return (
      <>
        <CategoryCards rows={rows} marks={marks} save={save} onOpen={setDialog} />
        {dialog && <RowDialogView dialog={dialog} rows={rows} onClose={() => setDialog(null)} />}
      </>
    );
  }

  return (
    <>
      <div
        role="region"
        tabIndex={0}
        aria-label="Budget by category"
        className="relative overflow-x-auto rounded-lg border border-line bg-surface"
      >
        <table className="num w-full min-w-[760px] border-collapse text-body-sm">
          <thead className="bg-surface-sunken text-left text-caption text-fg-muted">
            <tr>
              <th scope="col" className={th}>
                Category
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                %
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                Allocated
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                Committed
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                Paid
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                Variance
              </th>
              <th scope="col" className={th}>
                Note
              </th>
              {editable && (
                <th scope="col" className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const adjusted = marks?.adjusted.includes(row.id);
              return (
                <tr key={row.id} className={cx("border-t border-line", adjusted && "motion-highlight")}>
                  <th scope="row" className="px-3 py-2 text-left font-semibold">
                    {row.category}
                  </th>
                  <td className="px-3 py-2 text-right">
                    {editable ? (
                      <CellInput
                        kind="percent"
                        value={row.percent}
                        label={`${row.category}, percent`}
                        onCommit={(p) => save(row, amountForPercent(p, plan.budget.total))}
                      />
                    ) : (
                      row.percent.toFixed(1)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editable ? (
                      <CellInput
                        kind="money"
                        value={row.amount}
                        label={`${row.category}, allocated amount`}
                        onCommit={(amount) => save(row, amount)}
                      />
                    ) : (
                      formatInr(row.amount)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{formatInr(row.committed)}</td>
                  <td className="px-3 py-2 text-right">{formatInr(row.paid)}</td>
                  <td className="px-3 py-2 text-right">
                    <Variance row={row} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {adjusted && (
                        <Tag tone="warning" icon={<ArrowLeftRight aria-hidden="true" />}>
                          Adjusted
                        </Tag>
                      )}
                      {marks?.edited === row.id && <OriginTag origin="you" />}
                      {row.isContingency && (
                        <Tag tone="neutral" icon={<Lock aria-hidden="true" />}>
                          Always kept
                        </Tag>
                      )}
                      {row.note && <span className="text-fg-muted">{row.note}</span>}
                      {row.note && row.origin === "ai" && <OriginTag origin="ai">AI</OriginTag>}
                    </span>
                  </td>
                  {editable && (
                    <td className="px-3 py-2">
                      <RowActions row={row} onOpen={setDialog} />
                    </td>
                  )}
                </tr>
              );
            })}
            <tr className="border-t-2 border-line font-bold">
              <th scope="row" className="px-3 py-2 text-left">
                Total
              </th>
              <td className="px-3 py-2 text-right">100.0</td>
              <td className="px-3 py-2 text-right">{formatInr(totals.amount)}</td>
              <td className="px-3 py-2 text-right">{formatInr(totals.committed)}</td>
              <td className="px-3 py-2 text-right">{formatInr(totals.paid)}</td>
              <td className="px-3 py-2 text-right">{formatInr(totals.variance)}</td>
              <td colSpan={editable ? 2 : 1} />
            </tr>
          </tbody>
        </table>
      </div>
      {dialog && <RowDialogView dialog={dialog} rows={rows} onClose={() => setDialog(null)} />}
    </>
  );
}
