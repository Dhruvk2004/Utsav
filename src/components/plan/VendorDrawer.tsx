"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { OriginTag } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField, TextField } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { TextareaField } from "@/components/ui/TextareaField";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { groupIndian, parseRupees } from "@/lib/client/money";
import { functionNames, overpaidText } from "@/lib/client/vendorsView";
import { formatInr } from "@/lib/domain/budget";
import { formatShortDate, offsetLabel } from "@/lib/domain/dates";
import { VENDOR_STATUS_LABELS } from "@/lib/domain/labels";
import type { VendorView } from "@/lib/domain/view";
import { EnquiryDraft } from "./EnquiryDraft";
import { StatusPill } from "./StatusPill";

function money(value: number | null): string {
  return value === null ? "" : groupIndian(value);
}

/** Delete, or explain why a booked or paid vendor can't be deleted yet (design-system 6.4). */
function DeleteVendor({ vendor, onDeleted }: { vendor: VendorView; onDeleted: () => void }) {
  const { edit } = useWorkspace();
  const [open, setOpen] = useState(false);
  const blocked = vendor.status === "booked" || vendor.status === "paid";
  return (
    <>
      <Button variant="danger-outline" onClick={() => setOpen(true)}>
        Delete vendor
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={blocked ? `${vendor.category} can't be deleted yet` : `Delete ${vendor.category}?`}
        actions={
          blocked ? (
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const result = await edit([{ type: "remove_vendor", vendorId: vendor.id }]);
                  if (result.ok) onDeleted();
                }}
              >
                Delete
              </Button>
            </>
          )
        }
      >
        <p className="m-0">
          {blocked
            ? `${vendor.category} is ${VENDOR_STATUS_LABELS[vendor.status].toLowerCase()}, so its ${formatInr(vendor.quotedAmount ?? 0)} counts as committed. Change the status (for example to Not needed) before deleting.`
            : `Notes, amounts and saved drafts for ${vendor.category} will be deleted.`}
        </p>
      </Dialog>
    </>
  );
}

/**
 * The vendor drawer (spec 5.6, 10.10): every field the user owns (label and contact are never
 * shown to AI or on share links), questions, status history and the enquiry draft. Read-only in
 * the demo.
 */
export function VendorDrawer({ vendor, onClose }: { vendor: VendorView; onClose: () => void }) {
  const { plan, editable, edit } = useWorkspace();
  const [fields, setFields] = useState({
    label: vendor.label,
    contact: vendor.contact,
    budgetLineId: vendor.budgetLineId ?? "",
    notes: vendor.notes,
    questions: vendor.questions.join("\n"),
    quoted: money(vendor.quotedAmount),
    paid: money(vendor.paidAmount || null),
  });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof fields) => (value: string) => setFields((f) => ({ ...f, [key]: value }));
  const overpaid = overpaidText(vendor);

  async function save() {
    const result = await edit(
      [
        {
          type: "update_vendor",
          vendorId: vendor.id,
          patch: {
            label: fields.label,
            contact: fields.contact,
            notes: fields.notes,
            budgetLineId: fields.budgetLineId || null,
            questions: fields.questions
              .split("\n")
              .map((q) => q.trim())
              .filter(Boolean),
            quotedAmount: parseRupees(fields.quoted),
            paidAmount: parseRupees(fields.paid) ?? 0,
          },
        },
      ],
      undefined,
      { showsError: true },
    );
    if (result.ok) onClose();
    else setError(result.reason ?? "The vendor could not be saved.");
  }

  const details = (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-body-sm">
      <dt className="text-fg-muted">Status</dt>
      <dd className="m-0">
        <StatusPill status={vendor.status} />
      </dd>
      <dt className="text-fg-muted">Book by</dt>
      <dd className="m-0">
        {formatShortDate(vendor.bookBy)} ({offsetLabel(vendor.bookByDaysBefore).toLowerCase()}){vendor.rushed && " · Rushed"}
      </dd>
      {vendor.functionIds.length > 0 && (
        <>
          <dt className="text-fg-muted">Functions</dt>
          <dd className="m-0">{functionNames(plan, vendor).join(", ")}</dd>
        </>
      )}
      <dt className="text-fg-muted">History</dt>
      <dd className="m-0">
        {vendor.history.map((h) => `${VENDOR_STATUS_LABELS[h.status]} ${formatShortDate(h.at.slice(0, 10))}`).join(" → ") || "None yet"}
      </dd>
    </dl>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      variant="sheet"
      title={vendor.category}
      actions={
        editable ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void save()}>Save changes</Button>
          </>
        ) : undefined
      }
    >
      {details}
      {overpaid && <p className="m-0 font-semibold text-warning">{overpaid}</p>}
      {editable ? (
        <>
          <TextField
            id="vendor-label"
            label="Your label"
            optional
            hint="Only you see this; it is never sent to AI."
            value={fields.label}
            maxLength={60}
            onChange={(e) => set("label")(e.target.value)}
          />
          <TextField
            id="vendor-contact"
            label="Contact"
            optional
            hint="A phone or email for your own use. Never shown on share links."
            value={fields.contact}
            maxLength={120}
            onChange={(e) => set("contact")(e.target.value)}
          />
          <SelectField
            id="vendor-line"
            label="Budget line"
            value={fields.budgetLineId}
            onChange={(e) => set("budgetLineId")(e.target.value)}
            options={[{ value: "", label: "None" }, ...plan.budget.lines.map((line) => ({ value: line.id, label: line.category }))]}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MoneyField id="vendor-quoted" label="Quoted" optional value={fields.quoted} onChange={set("quoted")} />
            <MoneyField id="vendor-paid" label="Paid" optional value={fields.paid} onChange={set("paid")} />
          </div>
          <TextareaField
            id="vendor-notes"
            label="Notes"
            optional
            value={fields.notes}
            maxLength={1000}
            onChange={(e) => set("notes")(e.target.value)}
          />
          <TextareaField
            id="vendor-questions"
            label="Questions to ask (one per line)"
            optional
            hint={vendor.origin === "ai" ? "Suggested by AI; edit them freely." : undefined}
            value={fields.questions}
            maxLength={1300}
            onChange={(e) => set("questions")(e.target.value)}
          />
          {error && (
            <p role="alert" className="m-0 text-danger">
              {error}
            </p>
          )}
          <EnquiryDraft vendor={vendor} />
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {vendor.status !== "not_needed" && (
              <Button
                variant="secondary"
                onClick={async () => {
                  const result = await edit([{ type: "set_vendor_status", vendorId: vendor.id, status: "not_needed" }]);
                  if (result.ok) onClose();
                }}
              >
                Mark not needed
              </Button>
            )}
            <DeleteVendor vendor={vendor} onDeleted={onClose} />
          </div>
        </>
      ) : (
        vendor.questions.length > 0 && (
          <section className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
            <h3 className="m-0 flex items-center gap-2 text-body-sm font-semibold">
              Questions to ask {vendor.origin === "ai" && <OriginTag origin="ai">AI</OriginTag>}
            </h3>
            <ul className="m-0 grid gap-1 pl-5 text-body-sm">
              {vendor.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </section>
        )
      )}
    </Dialog>
  );
}
