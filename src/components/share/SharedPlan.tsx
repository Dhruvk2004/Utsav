import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { StatusPill } from "@/components/plan/StatusPill";
import { ButtonLink } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/Progress";
import type { SharedView } from "@/lib/client/shareView";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-line pt-5">
      <h2 id={id} className="m-0 text-h2 font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SharedPlanView({ view }: { view: SharedView }) {
  return (
    <div className="mx-auto grid w-full max-w-[900px] gap-5 px-4 py-7 sm:px-6">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        <h1 className="m-0 font-display text-h1 font-semibold">{view.heading}</h1>
        <p className="m-0 text-fg-muted">{view.meta}</p>
        {view.budgetTotal && <p className="num m-0 font-semibold">Budget {view.budgetTotal}</p>}
      </div>
      {view.functions.length > 0 && (
        <Section id="shared-functions" title="Functions">
          <p className="m-0 text-body-sm">{view.functions.join(" · ")}</p>
        </Section>
      )}
      <Section id="shared-budget" title="Budget">
        {view.money && (
          <p className="num m-0 text-body-sm">
            Committed <b>{view.money.committed}</b> · Paid <b>{view.money.paid}</b> · Remaining <b>{view.money.remaining}</b>
            {view.money.overpaid && (
              <>
                {" "}
                · <b className="text-warning">Paid above quotes {view.money.overpaid}</b>
              </>
            )}
          </p>
        )}
        <details open className="rounded-lg border border-line bg-surface">
          <summary className="min-h-11 cursor-pointer px-4 py-3 text-body-sm font-semibold">All {view.lines.length} budget lines</summary>
          <div role="region" tabIndex={0} aria-label="Budget lines" className="relative overflow-x-auto">
            <table className="num w-full min-w-[420px] border-collapse text-body-sm">
              <thead className="bg-surface-sunken text-left text-caption text-fg-muted">
                <tr>
                  <th scope="col" className="px-4 py-2">
                    Category
                  </th>
                  {view.money && (
                    <>
                      <th scope="col" className="px-4 py-2 text-right">
                        Allocated
                      </th>
                      <th scope="col" className="px-4 py-2 text-right">
                        Committed
                      </th>
                      <th scope="col" className="px-4 py-2 text-right">
                        Paid
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {view.lines.map((line) => (
                  <tr key={line.category} className="border-t border-line">
                    <th scope="row" className="px-4 py-2 text-left font-semibold">
                      {line.category}
                    </th>
                    {line.amount && (
                      <>
                        <td className="px-4 py-2 text-right">{line.amount}</td>
                        <td className="px-4 py-2 text-right">
                          {line.committed}
                          {line.over && <span className="block text-caption font-semibold text-danger">{line.over}</span>}
                        </td>
                        <td className="px-4 py-2 text-right">{line.paid}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Section>
      <Section id="shared-timeline" title="Timeline">
        <div className="grid max-w-md gap-1.5">
          <span className="text-body-sm">
            {view.progress.done} of {view.progress.total} done · {view.progress.percent}%
          </span>
          <ProgressBar
            label="Tasks done"
            value={view.progress.percent}
            valueText={`${view.progress.done} of ${view.progress.total} tasks done`}
          />
        </div>
        {view.next.length > 0 && <p className="m-0 text-body-sm">Next: {view.next.join(" · ")}</p>}
      </Section>
      <Section id="shared-vendors" title="Vendors">
        <ul className="m-0 grid list-none gap-2 p-0">
          {view.vendors.map((vendor) => (
            <li
              key={vendor.category}
              className="grid grid-cols-[minmax(0,1fr)] gap-1 rounded-md border border-line bg-surface px-4 py-2.5 text-body-sm"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <b>{vendor.category}</b>
                <StatusPill status={vendor.status} />
              </span>
              {vendor.amounts && <span className="num text-fg-muted">{vendor.amounts}</span>}
              {vendor.note && <span className="text-fg-muted">Note: {vendor.note}</span>}
            </li>
          ))}
        </ul>
        {view.notNeeded > 0 && <p className="m-0 text-body-sm text-fg-muted">{view.notNeeded} marked Not needed</p>}
      </Section>
      {view.ideas.length > 0 && (
        <Section id="shared-ideas" title="Saved ideas">
          <p className="m-0 text-body-sm">{view.ideas.join(" · ")}</p>
        </Section>
      )}
      <p className="m-0 border-t border-line pt-5 text-caption text-fg-muted">
        Costs are estimates. Shared by the event owner. Utsav does not list vendors.
      </p>
    </div>
  );
}

/** The share page's own header: logo, "Shared plan (read-only)" and Make your own. */
export function SharedHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 max-w-[900px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-sm">
          <Logo className="h-7 w-auto" />
        </Link>
        <span className="flex-1 text-right text-body-sm text-fg-muted max-sm:hidden">Shared plan (read-only)</span>
        <ButtonLink href="/signin" size="sm" variant="secondary" className="max-sm:ml-auto">
          Make your own
        </ButtonLink>
      </div>
    </header>
  );
}
