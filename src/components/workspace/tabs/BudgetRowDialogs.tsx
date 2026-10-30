"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField, TextField } from "@/components/ui/Field";
import { MenuButton } from "@/components/ui/Menu";
import { TextareaField } from "@/components/ui/TextareaField";
import type { BudgetRow } from "@/lib/client/budgetTable";
import { formatInr } from "@/lib/domain/budget";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import { useWorkspace } from "../WorkspaceContext";

export type RowDialog = { kind: "rename" | "note" | "delete"; row: BudgetRow } | null;

/** Edit note, rename and delete for one category. */
export function RowActions({ row, onOpen }: { row: BudgetRow; onOpen: (dialog: RowDialog) => void }) {
  return (
    <MenuButton
      menuLabel={`${row.category} actions`}
      triggerClassName={buttonClasses({ variant: "ghost", size: "sm", iconOnly: true })}
      trigger={
        <>
          <MoreHorizontal size={16} aria-hidden="true" />
          <span className="sr-only">{row.category} actions</span>
        </>
      }
      items={[
        {
          kind: "action",
          label: "Edit note",
          icon: <Pencil size={16} aria-hidden="true" />,
          onSelect: () => onOpen({ kind: "note", row }),
        },
        ...(row.isContingency
          ? []
          : [
              {
                kind: "action" as const,
                label: "Rename",
                icon: <Pencil size={16} aria-hidden="true" />,
                onSelect: () => onOpen({ kind: "rename", row }),
              },
              {
                kind: "action" as const,
                label: "Delete",
                icon: <Trash2 size={16} aria-hidden="true" />,
                onSelect: () => onOpen({ kind: "delete", row }),
              },
            ]),
      ]}
    />
  );
}

/** Rename, note and delete for one category; delete says where the money and vendors go. */
export function RowDialogView({ dialog, rows, onClose }: { dialog: NonNullable<RowDialog>; rows: BudgetRow[]; onClose: () => void }) {
  const { edit } = useWorkspace();
  const { row } = dialog;
  const contingency = rows.find((r) => r.isContingency);
  const [text, setText] = useState(dialog.kind === "rename" ? row.category : row.note);
  const [moveTo, setMoveTo] = useState(contingency?.id ?? rows.find((r) => r.id !== row.id)?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const target = rows.find((r) => r.id === moveTo);

  async function confirm() {
    const op: PlanOperation =
      dialog.kind === "rename"
        ? { type: "rename_budget_category", lineId: row.id, category: text }
        : dialog.kind === "note"
          ? { type: "set_budget_note", lineId: row.id, note: text }
          : { type: "remove_budget_category", lineId: row.id, moveToLineId: moveTo };
    const result = await edit([op], undefined, { showsError: true });
    if (result.ok) onClose();
    else setError(result.reason ?? "That change could not be saved.");
  }

  const titles = { rename: `Rename ${row.category}`, note: `Note for ${row.category}`, delete: `Delete ${row.category}?` };
  return (
    <Dialog
      open
      onClose={onClose}
      title={titles[dialog.kind]}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={dialog.kind === "delete" ? "danger" : "primary"} onClick={() => void confirm()}>
            {dialog.kind === "delete" ? "Delete" : "Save"}
          </Button>
        </>
      }
    >
      {dialog.kind === "rename" && (
        <TextField id="rename-category" label="Category name" value={text} maxLength={40} onChange={(e) => setText(e.target.value)} />
      )}
      {dialog.kind === "note" && (
        <TextareaField id="category-note" label="Note" optional value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
      )}
      {dialog.kind === "delete" && (
        <>
          <SelectField
            id="move-to"
            label="Move its amount and vendors to"
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
            options={rows.filter((r) => r.id !== row.id).map((r) => ({ value: r.id, label: r.category }))}
          />
          <p className="m-0">
            {formatInr(row.amount)} moves to {target?.category}.
            {row.vendors.length > 0 &&
              ` ${row.vendors.length} ${row.vendors.length === 1 ? "vendor" : "vendors"} will move to ${target?.category}: ${row.vendors.join(", ")}.`}
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="m-0 text-danger">
          {error}
        </p>
      )}
    </Dialog>
  );
}
