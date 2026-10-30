"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode, type SyntheticEvent } from "react";
import { Button } from "./Button";
import { cx } from "./cx";

/**
 * Modal dialog and side sheet on the native `<dialog>` with `showModal()` (design-system 6.8):
 * focus is trapped by the browser, Escape closes, and focus returns to the control that opened it.
 * A sheet sits on the right (560 px, or `wide` 720 px) and becomes full screen below 768 px.
 */
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Right-aligned actions: Cancel first, then the main action. Sheets keep them in a sticky footer. */
  actions?: ReactNode;
  variant?: "dialog" | "sheet";
  wide?: boolean;
  /** The content draws its own heading (with this id) and close button, e.g. the AI mode sheet. */
  labelledBy?: string;
}

export function Dialog({ open, onClose, title, children, actions, variant = "dialog", wide = false, labelledBy }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // A dialog its parent removes (Save, Apply) gets no close event, and the browser drops focus to
  // the page body; focus goes back to the control that opened it instead (CO-01).
  useEffect(
    () => () => {
      const target = opener.current;
      const active = document.activeElement;
      if (target?.isConnected && (active === null || active === document.body)) target.focus();
    },
    [],
  );

  function handleClose(event: SyntheticEvent<HTMLDialogElement>) {
    // React passes a nested dialog's close up the component tree; only this dialog's own close counts.
    if (event.target !== event.currentTarget) return;
    onClose();
    opener.current?.focus();
  }

  const sheet = variant === "sheet";
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy ?? titleId}
      onClose={handleClose}
      className={cx(
        "motion-sheet m-auto bg-surface p-0 text-fg shadow-3 backdrop:bg-scrim",
        sheet
          ? cx("h-dvh max-h-none w-full max-w-none md:mr-0 md:h-dvh", wide ? "md:w-[720px]" : "md:w-[560px]")
          : "w-[min(480px,calc(100vw-32px))] rounded-xl",
      )}
    >
      <div className={cx("flex flex-col", sheet ? "h-full" : "gap-4 p-6")}>
        {!labelledBy && (
          <div className={cx("flex items-center justify-between gap-3", sheet && "sticky top-0 border-b border-line bg-surface px-6 py-4")}>
            <h2 id={titleId} className="m-0 text-h2 font-bold">
              {title}
            </h2>
            <Button variant="ghost" iconOnly aria-label="Close" onClick={() => ref.current?.close()}>
              <X size={20} aria-hidden="true" />
            </Button>
          </div>
        )}
        {/* A sheet's body has a fixed height and scrolls. Its rows size to their content and stack from the top
            (auto-rows-max, content-start); otherwise the grid squeezes a tall child such as the What-if table into
            a short row and draws the next rows over it (MQR-01). */}
        <div
          className={cx(
            "grid grid-cols-[minmax(0,1fr)] gap-4 text-body-sm",
            sheet && "min-h-0 flex-1 auto-rows-max content-start overflow-y-auto px-6 py-5",
          )}
        >
          {children}
        </div>
        {actions && (
          <div
            className={cx(
              "flex flex-wrap items-center justify-end gap-2",
              sheet && "sticky bottom-0 border-t border-line bg-surface px-6 py-3.5",
            )}
          >
            {actions}
          </div>
        )}
      </div>
    </dialog>
  );
}
