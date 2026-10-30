"use client";

import { CellInput } from "@/components/plan/CellInput";
import { cx } from "@/components/ui/cx";
import { formatInr } from "@/lib/domain/budget";
import { formatShortDate, formatTime } from "@/lib/domain/dates";
import { useWorkspace } from "../WorkspaceContext";
import { th } from "./BudgetTable";

/** By function (spec 5.4): the function-share table; shares are edited, amounts always follow. */
export function FunctionTable() {
  const { plan, editable, edit } = useWorkspace();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <div
        role="region"
        tabIndex={0}
        aria-label="Budget by function"
        className="relative overflow-x-auto rounded-lg border border-line bg-surface"
      >
        <table className="num w-full min-w-[560px] border-collapse text-body-sm">
          <thead className="bg-surface-sunken text-left text-caption text-fg-muted">
            <tr>
              <th scope="col" className={th}>
                Function
              </th>
              <th scope="col" className={th}>
                Date
              </th>
              <th scope="col" className={th}>
                Time
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                Share (%)
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.functions.map((fn) => (
              <tr key={fn.id} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left font-semibold">
                  {fn.name}
                </th>
                <td className="px-3 py-2">{formatShortDate(fn.date)}</td>
                <td className="px-3 py-2">
                  {fn.startTime && fn.endTime ? `${formatTime(fn.startTime)} – ${formatTime(fn.endTime)}` : "–"}
                </td>
                <td className="px-3 py-2 text-right">
                  {editable ? (
                    <CellInput
                      kind="percent"
                      value={fn.sharePercent}
                      label={`${fn.name}, share percent`}
                      onCommit={async (percent) => {
                        const result = await edit([{ type: "set_function_share", functionId: fn.id, percent }], undefined, {
                          showsError: true,
                        });
                        return result.ok || (result.reason ?? "This share could not be saved.");
                      }}
                    />
                  ) : (
                    `${fn.sharePercent}%`
                  )}
                </td>
                <td className="px-3 py-2 text-right">{formatInr(fn.amount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-line font-bold">
              <th scope="row" className="px-3 py-2 text-left">
                Total
              </th>
              <td colSpan={2} />
              <td className="px-3 py-2 text-right">100%</td>
              <td className="px-3 py-2 text-right">{formatInr(plan.budget.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="m-0 text-caption text-fg-muted">Amounts follow the shares and update whenever the total changes.</p>
    </div>
  );
}
