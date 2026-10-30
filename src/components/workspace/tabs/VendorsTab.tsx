"use client";

import { AlarmClock, Plus, Store, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAiSession } from "@/components/ai/AiSession";
import { OpEditor } from "@/components/plan/OpEditor";
import { PipelineBar, StatusPill } from "@/components/plan/StatusPill";
import { VendorDrawer } from "@/components/plan/VendorDrawer";
import { useAnnounce } from "@/components/ui/Announcer";
import { Button } from "@/components/ui/Button";
import { OriginTag, Tag } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { Dialog } from "@/components/ui/Dialog";
import { inputClasses, SelectField } from "@/components/ui/Field";
import { focusById } from "@/components/ui/focus";
import { FlameIcon } from "@/components/ui/icons";
import { MoneyField } from "@/components/ui/MoneyField";
import { EmptyState } from "@/components/ui/EmptyState";
import { groupIndian, parseRupees } from "@/lib/client/money";
import { editFormFor } from "@/lib/client/opForms";
import { amountsNeeded, overpaidText, PIPELINE, statusOp, vendorGroups } from "@/lib/client/vendorsView";
import { formatInr } from "@/lib/domain/budget";
import { overpaidOf } from "@/lib/domain/money";
import { formatShortDate } from "@/lib/domain/dates";
import { VENDOR_STATUS_LABELS } from "@/lib/domain/labels";
import { VENDOR_STATUSES, type VendorStatus } from "@/lib/domain/model/enums";
import type { VendorView } from "@/lib/domain/view";
import { useWorkspace } from "../WorkspaceContext";

const statusOf = (value: string): VendorStatus => VENDOR_STATUSES.find((status) => status === value) ?? "to_research";

/**
 * The status select with the inline amount prompt (design-system 6.4): Booked and Paid ask for
 * the quote (and Paid for the payment) before anything is saved; Cancel puts the status back.
 */
function StatusControl({ vendor }: { vendor: VendorView }) {
  const { edit } = useWorkspace();
  const announce = useAnnounce();
  const [pending, setPending] = useState<VendorStatus | null>(null);
  const [quoted, setQuoted] = useState(vendor.quotedAmount === null ? "" : groupIndian(vendor.quotedAmount));
  const [paid, setPaid] = useState(
    vendor.paidAmount > 0 ? groupIndian(vendor.paidAmount) : vendor.quotedAmount === null ? "" : groupIndian(vendor.quotedAmount),
  );
  const [error, setError] = useState<string | null>(null);
  const id = `status-${vendor.id}`;
  const prompt = useRef<HTMLDivElement>(null);

  // Focus moves to the first amount at once, not after the prompt animates in (design-system M13).
  useEffect(() => {
    if (pending) prompt.current?.querySelector("input")?.focus();
  }, [pending]);

  // A new status moves the card to another column, so focus follows it to its status select (CO-01).
  const refocus = () => focusById(id);

  async function choose(status: VendorStatus) {
    const needs = amountsNeeded(vendor, status);
    if (needs.quote || needs.paid) setPending(status);
    else if ((await edit([statusOp(vendor.id, status)])).ok) refocus();
  }

  async function confirm() {
    if (!pending) return;
    const paidAmount = parseRupees(paid);
    if (pending === "paid" && !paidAmount) {
      setError("Enter the amount you paid.");
      return;
    }
    const result = await edit(
      [statusOp(vendor.id, pending, { quoted: parseRupees(quoted), paid: pending === "paid" ? paidAmount : null })],
      undefined,
      { showsError: true },
    );
    if (result.ok) {
      setPending(null);
      setError(null);
      refocus();
    } else setError(result.reason ?? "The status could not be saved.");
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <label htmlFor={id} className="sr-only">
        Status of {vendor.category}
      </label>
      <select
        id={id}
        value={pending ?? vendor.status}
        onChange={(e) => void choose(statusOf(e.target.value))}
        className={inputClasses({ dense: true })}
      >
        {VENDOR_STATUSES.map((status) => (
          <option key={status} value={status}>
            {VENDOR_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      {pending && (
        <div
          ref={prompt}
          className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-md bg-surface-sunken p-3"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setPending(null);
              announce("Status not changed");
              refocus();
            }
          }}
        >
          {vendor.quotedAmount === null && (
            <MoneyField
              id={`${id}-quoted`}
              label={`Quoted amount (required to mark ${VENDOR_STATUS_LABELS[pending].toLowerCase()})`}
              value={quoted}
              onChange={setQuoted}
            />
          )}
          {pending === "paid" && (
            <MoneyField id={`${id}-paid`} label="Paid amount" value={paid} onChange={setPaid} error={error ?? undefined} />
          )}
          {error && pending !== "paid" && (
            <p role="alert" className="m-0 text-body-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void confirm()}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPending(null);
                announce("Status not changed");
                refocus();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function VendorCard({ vendor, onOpen }: { vendor: VendorView; onOpen: () => void }) {
  const { editable } = useWorkspace();
  const overpaid = overpaidText(vendor);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border border-line bg-surface p-3 shadow-1">
      <div className="flex items-start justify-between gap-2">
        <h3 className="m-0 text-body font-semibold">{vendor.category}</h3>
        {vendor.origin === "ai" && <OriginTag origin="ai">AI</OriginTag>}
      </div>
      {vendor.label && <span className="text-body-sm text-fg-muted">&ldquo;{vendor.label}&rdquo;</span>}
      <span className="flex flex-wrap items-center gap-1.5 text-body-sm text-fg-muted">
        Book by {formatShortDate(vendor.bookBy)}
        {vendor.rushed && (
          <Tag tone="warning" icon={<AlarmClock aria-hidden="true" />}>
            Rushed
          </Tag>
        )}
      </span>
      {vendor.quotedAmount !== null && (
        <span className="num text-body-sm">
          Quote {formatInr(vendor.quotedAmount)}
          {vendor.paidAmount > 0 && ` · Paid ${formatInr(vendor.paidAmount)}`}
        </span>
      )}
      {overpaid && (
        <span className="flex items-center gap-1.5 text-body-sm font-semibold text-warning">
          <TriangleAlert size={16} aria-hidden="true" />
          {overpaid}
        </span>
      )}
      {vendor.questions.length > 0 && (
        <span className="flex items-center gap-1.5 text-caption text-fg-muted">
          <FlameIcon size={14} className="text-warning" />
          {vendor.questions.length} questions to ask
        </span>
      )}
      {editable ? <StatusControl vendor={vendor} /> : <StatusPill status={vendor.status} />}
      <PipelineBar status={vendor.status} />
      <Button
        variant="ghost"
        size="sm"
        className="justify-self-start"
        aria-label={`${editable ? "Open" : "Details"} ${vendor.category}`}
        onClick={onOpen}
      >
        {editable ? "Open" : "Details"}
      </Button>
    </li>
  );
}

/** Vendors (spec 5.6, 10.10): the per-plan vendor checklist in pipeline columns, with totals and a drawer. */
export function VendorsTab() {
  const { plan, view, editable, today, edit } = useWorkspace();
  const { openPanel } = useAiSession();
  const [functionId, setFunctionId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<VendorStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const groups = vendorGroups(view, functionId);
  const open = view.vendors.find((vendor) => vendor.id === openId);
  const { money } = view;
  // Not part of committed (spec 12.2), so a treasurer sees it next to Remaining (CO-07).
  const overpaid = overpaidOf(plan.vendors);
  const addForm = editFormFor({ type: "add_vendor", category: "", bookByDaysBefore: 30 }, plan, today);

  const addSheet = adding && addForm && (
    <Dialog open variant="sheet" title="Add a vendor" onClose={() => setAdding(false)}>
      <OpEditor
        form={addForm}
        submitLabel="Add vendor"
        onCancel={() => setAdding(false)}
        onSubmit={async (op) => {
          const result = await edit([op], undefined, { showsError: true });
          if (result.ok) setAdding(false);
          return result.ok ? null : (result.reason ?? "The vendor could not be added.");
        }}
      />
    </Dialog>
  );

  if (plan.vendors.length === 0) {
    return (
      <>
        <EmptyState
          icon={<Store aria-hidden="true" />}
          title="No vendors yet"
          body="Add a vendor category to start your checklist."
          actions={
            <>
              {editable && <Button onClick={() => setAdding(true)}>Add a vendor category</Button>}
              <Button
                variant="secondary"
                icon={<FlameIcon className="text-warning" />}
                onClick={() => openPanel("Suggest the vendor categories I need")}
              >
                Suggest vendors with AI
              </Button>
            </>
          }
        />
        {addSheet}
      </>
    );
  }

  const shown = groups.filter((group) => group.status !== "not_needed" && (statusFilter === "all" || statusFilter === group.status));
  const notNeeded = groups.find((group) => group.status === "not_needed")?.vendors ?? [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <p className="num m-0 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-line bg-surface px-4 py-3 text-body-sm">
        <span>
          Quoted (awaiting) <b>{formatInr(money.quotedOpen)}</b>
        </span>
        <span>
          Committed <b>{formatInr(money.committed)}</b>
        </span>
        <span>
          Paid <b>{formatInr(money.paid)}</b>
        </span>
        <span>
          Remaining <b>{money.remaining < 0 ? `Over by ${formatInr(-money.remaining)}` : formatInr(money.remaining)}</b>
        </span>
        {overpaid > 0 && (
          <span className="font-semibold text-warning">
            Paid above quotes <b>{formatInr(overpaid)}</b>
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {editable && (
          <Button variant="secondary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setAdding(true)}>
            Add vendor
          </Button>
        )}
        {plan.functions.length > 0 && (
          <SelectField
            id="vendor-function"
            label="Function"
            dense
            value={functionId ?? ""}
            onChange={(e) => setFunctionId(e.target.value || null)}
            options={[{ value: "", label: "All functions" }, ...plan.functions.map((fn) => ({ value: fn.id, label: fn.name }))]}
          />
        )}
        <SelectField
          id="vendor-status-filter"
          label="Status"
          dense
          className="@min-[900px]/workspace:hidden"
          value={statusFilter}
          onChange={(e) => setStatusFilter(PIPELINE.find((status) => status === e.target.value) ?? "all")}
          options={[
            { value: "all", label: "All statuses" },
            ...PIPELINE.map((status) => ({ value: status, label: VENDOR_STATUS_LABELS[status] })),
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 @min-[900px]/workspace:grid-cols-5">
        {shown.map((group) => (
          <section
            key={group.status}
            aria-labelledby={`vendors-${group.status}`}
            className="grid content-start grid-cols-[minmax(0,1fr)] gap-2"
          >
            <h2 id={`vendors-${group.status}`} className="m-0 flex items-center gap-2 text-body font-semibold">
              <StatusPill status={group.status} /> <span className="num text-fg-muted">({group.vendors.length})</span>
            </h2>
            <ul className={cx("m-0 grid list-none gap-2 p-0", group.vendors.length === 0 && "hidden")}>
              {group.vendors.map((vendor) => (
                <VendorCard key={vendor.id} vendor={vendor} onOpen={() => setOpenId(vendor.id)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      {notNeeded.length > 0 && (
        <details className="rounded-lg border border-line bg-surface px-4">
          <summary className="min-h-11 cursor-pointer py-3 text-body-sm font-semibold">Not needed ({notNeeded.length})</summary>
          <ul className="m-0 grid list-none gap-2 p-0 pb-4">
            {notNeeded.map((vendor) => (
              <VendorCard key={vendor.id} vendor={vendor} onOpen={() => setOpenId(vendor.id)} />
            ))}
          </ul>
        </details>
      )}
      {open && <VendorDrawer key={open.id} vendor={open} onClose={() => setOpenId(null)} />}
      {addSheet}
    </div>
  );
}
