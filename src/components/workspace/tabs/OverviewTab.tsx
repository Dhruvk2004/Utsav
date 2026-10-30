"use client";

import { ChevronRight, Pencil } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { StatusPill } from "@/components/plan/StatusPill";
import { RushedTag, TaskCheck } from "@/components/plan/TaskCheck";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { OriginTag } from "@/components/ui/Chip";
import { ProgressBar } from "@/components/ui/Progress";
import { TextareaField } from "@/components/ui/TextareaField";
import { addDays, formatShortDate } from "@/lib/domain/dates";
import { formatInr } from "@/lib/domain/budget";
import { functionWhen } from "@/lib/domain/describe";
import { overpaidOf } from "@/lib/domain/money";
import { VENDOR_STATUSES } from "@/lib/domain/model/enums";
import { useWorkspace } from "../WorkspaceContext";

/** A titled overview card with its "go to tab" link. */
export function OverviewCard({ title, link, children }: { title: string; link?: { href: string; label: string }; children: ReactNode }) {
  return (
    <section className="grid content-start grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-line bg-surface p-4 shadow-1 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-h3 font-[650]">{title}</h2>
        {link && (
          <Link href={link.href} className="inline-flex min-h-11 items-center gap-1 text-body-sm font-semibold text-brand">
            {link.label}
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function SummaryCard() {
  const { plan, editable, edit } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(plan.summary.text);
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border border-line bg-surface p-4 shadow-1 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="m-0 text-h3 font-[650]">Summary</h2>
          {plan.summary.origin === "ai" && <OriginTag origin="ai">AI</OriginTag>}
        </div>
        {editable && !editing && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil size={16} aria-hidden="true" />}
            aria-label="Edit summary"
            onClick={() => {
              setText(plan.summary.text);
              setEditing(true);
            }}
          >
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <form
          className="grid grid-cols-[minmax(0,1fr)] gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await edit([{ type: "set_summary", text }]);
            if (result.ok) setEditing(false);
          }}
        >
          <TextareaField
            id="summary-text"
            label="Summary"
            value={text}
            maxLength={600}
            rows={4}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="submit">Save</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p className="m-0 text-body-sm">{plan.summary.text || "No summary yet."}</p>
      )}
    </section>
  );
}

/** Overview (spec 5.3, 10.6): warnings, summary and the five cards that link to their tabs. */
export function OverviewTab({ banner }: { banner?: ReactNode }) {
  const { plan, view, today, tabHref } = useWorkspace();
  const { money } = view;
  const percent = plan.budget.total === 0 ? 0 : Math.round((money.committed / plan.budget.total) * 100);
  const weekEnd = addDays(today, 6);
  const thisWeek = view.tasks.filter((task) => !task.done && task.dueDate <= weekEnd).slice(0, 6);
  const savedIdeas = plan.ideas.filter((idea) => idea.state === "saved");
  // Over-payments are not in committed (spec 12.2), so they are called out next to Remaining (CO-07).
  const overpaid = overpaidOf(plan.vendors);
  const newIdeas = plan.ideas.filter((idea) => idea.state === "suggested").length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {banner}
      {plan.source === "template" && (
        <Alert tone="neutral" title="Started from a template because AI was unavailable.">
          Use AI mode to personalise it.
        </Alert>
      )}
      {view.warnings.map((warning) => (
        <Alert key={warning} tone="warning" title={warning} />
      ))}
      <SummaryCard />
      <div className="grid grid-cols-1 gap-5 @min-[720px]/workspace:grid-cols-2">
        <OverviewCard title="Budget health" link={{ href: tabHref("budget"), label: "Budget" }}>
          <dl className="num m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-body-sm">
            <dt className="text-fg-muted">Total</dt>
            <dd className="m-0 text-right font-semibold">{formatInr(plan.budget.total)}</dd>
            <dt className="text-fg-muted">Committed</dt>
            <dd className="m-0 text-right font-semibold">{formatInr(money.committed)}</dd>
            <dt className="text-fg-muted">Paid</dt>
            <dd className="m-0 text-right font-semibold">{formatInr(money.paid)}</dd>
            <dt className="text-fg-muted">Remaining</dt>
            <dd className="m-0 text-right font-semibold">
              {money.remaining < 0 ? `Over by ${formatInr(-money.remaining)}` : formatInr(money.remaining)}
            </dd>
            {overpaid > 0 && (
              <>
                <dt className="text-warning">Paid above quotes</dt>
                <dd className="m-0 text-right font-semibold text-warning">{formatInr(overpaid)}</dd>
              </>
            )}
          </dl>
          <ProgressBar label="Budget committed" value={Math.min(percent, 100)} valueText={`${percent}% committed`} />
          <span className="text-caption text-fg-muted">{percent}% committed</span>
        </OverviewCard>
        <OverviewCard title="This week" link={{ href: tabHref("timeline"), label: "Timeline" }}>
          {thisWeek.length === 0 ? (
            <p className="m-0 text-body-sm text-fg-muted">Nothing due this week.</p>
          ) : (
            <ul className="m-0 grid list-none gap-1 p-0">
              {thisWeek.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-1.5 last:border-0">
                  <TaskCheck task={task} />
                  <span className="flex items-center gap-2 text-body-sm text-fg-muted">
                    <RushedTag task={task} />
                    {task.dueDate === today ? "Today" : formatShortDate(task.dueDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </OverviewCard>
        {plan.functions.length > 0 && (
          <OverviewCard
            title="Functions"
            link={{ href: `${tabHref("budget")}${tabHref("budget").includes("?") ? "&" : "?"}view=functions`, label: "By function" }}
          >
            <table className="num w-full border-collapse text-body-sm">
              <caption className="sr-only">Functions with their date, share and amount</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Function</th>
                  <th scope="col">When</th>
                  <th scope="col">Share</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {plan.functions.map((fn) => (
                  <tr key={fn.id} className="border-b border-line last:border-0">
                    <th scope="row" className="py-1.5 pr-2 text-left font-semibold">
                      {fn.name}
                    </th>
                    <td className="py-1.5 pr-2 text-fg-muted">{functionWhen(fn)}</td>
                    <td className="py-1.5 pr-2 text-right">{fn.sharePercent}%</td>
                    <td className="py-1.5 text-right">{formatInr(fn.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </OverviewCard>
        )}
        <OverviewCard title="Vendors" link={{ href: tabHref("vendors"), label: "Vendors" }}>
          <div className="flex flex-wrap gap-2">
            {VENDOR_STATUSES.filter((status) => status !== "not_needed" && plan.stats.vendorsByStatus[status] > 0).map((status) => (
              <span key={status} className="inline-flex items-center gap-1.5 text-body-sm">
                <span className="num font-semibold">{plan.stats.vendorsByStatus[status]}</span>
                <StatusPill status={status} />
              </span>
            ))}
          </div>
        </OverviewCard>
        <OverviewCard title="Saved ideas" link={{ href: tabHref("ideas"), label: "Ideas" }}>
          {newIdeas > 0 && (
            <p className="m-0 flex flex-wrap items-center gap-2 text-body-sm">
              <OriginTag origin="ai">From your new plan</OriginTag>
              <b>
                {newIdeas} {newIdeas === 1 ? "idea" : "ideas"}
              </b>{" "}
              to review
            </p>
          )}
          {savedIdeas.length === 0 ? (
            <p className="m-0 text-body-sm text-fg-muted">No saved ideas yet.</p>
          ) : (
            <ul className="m-0 grid list-disc gap-1 pl-5 text-body-sm">
              {savedIdeas.slice(0, 3).map((idea) => (
                <li key={idea.id}>{idea.title}</li>
              ))}
            </ul>
          )}
        </OverviewCard>
      </div>
    </div>
  );
}
