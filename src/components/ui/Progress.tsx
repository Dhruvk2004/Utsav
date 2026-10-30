import { Check, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Progress (design-system 6.10). Bars are always named and paired with visible text; non-AI
 * progress uses the brand fill. Steps mark the current one with aria-current="step".
 */

export function ProgressBar({
  label,
  value,
  max = 100,
  valueText,
  className,
  thin = false,
}: {
  label: string;
  value: number;
  max?: number;
  valueText: string;
  className?: string;
  thin?: boolean;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={valueText}
      className={cx("overflow-hidden bg-neutral-tint", thin ? "h-1" : "h-2 rounded-pill", className)}
    >
      <div className={cx("motion-fill h-full w-full bg-brand", !thin && "rounded-pill")} style={{ transform: `scaleX(${ratio})` }} />
    </div>
  );
}

/** Numbered step dots with labels; done steps show a check, the current one is filled in brand. */
export function StepIndicator({
  steps,
  current,
  label,
  showAllLabels = true,
}: {
  steps: readonly string[];
  current: number;
  label: string;
  showAllLabels?: boolean;
}) {
  return (
    <ol aria-label={label} className="m-0 flex list-none flex-wrap items-center gap-2 p-0 text-[13px] font-semibold text-fg-muted">
      {steps.map((name, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li
            key={name}
            aria-current={state === "current" ? "step" : undefined}
            className={cx("flex items-center gap-2", state === "current" && "text-fg")}
          >
            {i > 0 && <span className="h-[1.5px] w-5 bg-line-strong sm:w-7" aria-hidden="true" />}
            <span
              className={cx(
                "inline-grid size-6 place-items-center rounded-full border-[1.5px] text-caption",
                state === "done" && "border-success bg-success text-on-solid",
                state === "current" && "border-brand bg-brand text-on-brand",
                state === "todo" && "border-line-strong",
              )}
              aria-hidden="true"
            >
              {state === "done" ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <span className={cx(!showAllLabels && state !== "current" && "sr-only")}>
              {name}
              {state === "done" && " "}
              {state === "done" && <span className="sr-only">(done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export type StageState = "done" | "active" | "pending" | "failed";

/**
 * Staged progress for AI work (the generating card): three stages with icons, announced politely.
 * Under reduced motion the spinner is static and the stage text carries the state.
 */
export function StagedProgress({
  title,
  stages,
  note,
  action,
}: {
  title: string;
  stages: readonly { label: string; state: StageState }[];
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rangoli grid min-h-[420px] place-items-center rounded-xl px-4 py-8">
      <div className="grid w-full max-w-[440px] gap-4 rounded-lg border border-line bg-surface p-7 shadow-2">
        <h2 className="m-0 text-h2 font-bold">{title}</h2>
        <ol className="m-0 grid list-none gap-3 p-0" aria-live="polite">
          {stages.map((s) => (
            <li
              key={s.label}
              className={cx("flex items-center gap-2.5 text-body-sm", (s.state === "active" || s.state === "failed") && "font-semibold")}
            >
              <StageDot state={s.state} />
              <span>
                {s.label}
                <span className="sr-only">{STAGE_TEXT[s.state]}</span>
              </span>
            </li>
          ))}
        </ol>
        {note && <p className="m-0 text-caption text-fg-muted">{note}</p>}
        {action && <div className="justify-self-end">{action}</div>}
      </div>
    </div>
  );
}

const STAGE_TEXT: Record<StageState, string> = { done: " (done)", active: " (in progress)", pending: " (waiting)", failed: "" };

function StageDot({ state }: { state: StageState }) {
  const base = "grid size-5 shrink-0 place-items-center rounded-full";
  if (state === "done")
    return (
      <span className={cx(base, "bg-success text-on-solid")} aria-hidden="true">
        <Check size={14} strokeWidth={3} />
      </span>
    );
  if (state === "failed")
    return (
      <span className={cx(base, "text-warning")} aria-hidden="true">
        <TriangleAlert size={18} />
      </span>
    );
  if (state === "active") return <span className="spinner size-5 text-accent" aria-hidden="true" />;
  return <span className={cx(base, "border-[1.5px] border-line-strong")} aria-hidden="true" />;
}
