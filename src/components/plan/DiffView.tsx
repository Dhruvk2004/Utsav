import type { CardDiff, DiffRow } from "@/lib/domain/describe";
import { cx } from "@/components/ui/cx";

const DELTA_TONES = {
  less: "bg-success-tint text-success",
  more: "bg-warning-tint text-warning",
  neutral: "bg-neutral-tint text-fg-muted",
} as const;

function Row({ row }: { row: DiffRow }) {
  return (
    <div className={cx("contents", row.total && "font-bold [&>*]:border-t [&>*]:border-line [&>*]:pt-1.5")}>
      <span className="min-w-0 text-fg-muted">{row.label}</span>
      {row.before === null ? (
        <span aria-hidden="true" />
      ) : (
        <span className="min-w-0 text-fg-muted line-through">
          <span className="sr-only">from </span>
          {row.before}
        </span>
      )}
      <span aria-hidden="true" className="text-fg-muted">
        {row.before === null ? "" : "→"}
      </span>
      <span className="min-w-0 font-semibold text-fg">
        {row.before !== null && <span className="sr-only">to </span>}
        {row.after}
      </span>
      <span className="min-w-0 @max-[420px]/diff:col-span-full @max-[420px]/diff:col-start-2">
        {row.delta && (
          <span className={cx("inline-flex h-6 items-center rounded-pill px-2 text-caption font-semibold", DELTA_TONES[row.delta.tone])}>
            <span aria-hidden="true">{row.delta.text}</span>
            <span className="sr-only">{row.delta.label}</span>
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Diff view (design-system 6.6): label | before | → | after | delta. Before is struck through and
 * read as "from"; the delta pill carries its sign and the words "less" or "more", never colour alone.
 */
export function DiffView({ diff }: { diff: Pick<CardDiff, "rows" | "notes"> }) {
  if (diff.rows.length === 0 && diff.notes.length === 0) return null;
  return (
    <div className="@container/diff grid gap-2 text-body-sm">
      {diff.rows.length > 0 && (
        <div className="num grid grid-cols-[minmax(0,max-content)_auto_16px_auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5">
          {diff.rows.map((row) => (
            <Row key={row.label} row={row} />
          ))}
        </div>
      )}
      {diff.notes.map((note) => (
        <p key={note} className="m-0 text-fg-muted">
          {note}
        </p>
      ))}
    </div>
  );
}
