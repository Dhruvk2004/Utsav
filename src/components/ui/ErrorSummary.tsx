import { CircleAlert } from "lucide-react";
import type { Ref } from "react";

export interface SummaryError {
  /** The id of the control to focus. */
  id: string;
  label: string;
  message: string;
}

/** "Fix 3 things to continue": the heading counts the errors (design-system 6.2). */
export function summaryHeading(count: number, goal: string): string {
  return `Fix ${count} ${count === 1 ? "thing" : "things"} to ${goal}`;
}

/**
 * Error summary at the top of a form, focused on submit. Each link moves focus to its field; the
 * inline messages stay under the fields. Shown instantly (never animated).
 */
export function ErrorSummary({
  errors,
  goal = "continue",
  ref,
}: {
  errors: readonly SummaryError[];
  goal?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  if (errors.length === 0) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="grid gap-1.5 rounded-md border border-l-4 border-[color:color-mix(in_srgb,var(--color-danger)_45%,transparent)] border-l-danger bg-danger-tint px-4 py-3.5"
    >
      <p className="m-0 flex items-center gap-2 font-bold text-danger">
        <CircleAlert size={20} aria-hidden="true" />
        {summaryHeading(errors.length, goal)}
      </p>
      <ul className="m-0 grid gap-1 pl-[18px] text-body-sm">
        {errors.map((e) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              className="font-semibold text-danger underline"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(e.id)?.focus();
              }}
            >
              {e.label}: {lowerFirst(e.message)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Guests: enter between 1 and 5,000 guests." reads as one sentence. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
