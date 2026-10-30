"use client";

import { useId, useState } from "react";
import { cx } from "@/components/ui/cx";
import { inputClasses } from "@/components/ui/Field";
import { formatRupeesInput, groupIndian, parseRupees } from "@/lib/client/money";

interface CellInputProps {
  value: number;
  /** Per-cell accessible name, e.g. "Decor, allocated amount" (design-system 8.5). */
  label: string;
  kind: "money" | "percent";
  /**
   * Saves the value. Resolving to `false` or a reason means it was refused: the cell goes back
   * to the saved value and shows the reason (CO-06).
   */
  onCommit: (value: number) => void | boolean | string | Promise<void | boolean | string>;
  className?: string;
}

const show = (value: number, kind: CellInputProps["kind"]) => (kind === "money" ? groupIndian(value) : String(value));

/**
 * An editable table cell that saves on blur or Enter (spec 5.4) and only when the value changed.
 * Escape puts the saved value back. Money keeps Indian grouping as the user types. A refused
 * save also puts the saved value back, marks the cell invalid and says why.
 */
export function CellInput({ value, label, kind, onCommit, className }: CellInputProps) {
  const [text, setText] = useState(show(value, kind));
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    // The plan changed underneath (a rebalance or an undo): show the new saved value.
    setPrev(value);
    setText(show(value, kind));
  }
  const parse = (raw: string) => (kind === "money" ? parseRupees(raw) : raw.trim() === "" ? null : Number(raw));

  async function commit() {
    const next = parse(text);
    if (next === null || Number.isNaN(next)) {
      setText(show(value, kind));
      return;
    }
    if (next === value) return;
    const outcome = await onCommit(next);
    if (outcome === false || typeof outcome === "string") {
      setText(show(value, kind));
      setError(typeof outcome === "string" ? outcome : "Not saved.");
    } else setError(null);
  }

  return (
    <span className={cx("relative inline-block", className)}>
      {kind === "money" && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-fg-muted">
          ₹
        </span>
      )}
      <input
        type="text"
        inputMode={kind === "money" ? "numeric" : "decimal"}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={text}
        onChange={(e) => {
          setError(null);
          setText(kind === "money" ? formatRupeesInput(e.target.value) : e.target.value);
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") setText(show(value, kind));
        }}
        className={cx(inputClasses({ dense: true }), "num text-right", kind === "money" ? "w-32 pl-5" : "w-20")}
      />
      {error && (
        <span id={errorId} role="alert" className="mt-1 block max-w-48 text-left text-caption text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
