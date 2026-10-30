"use client";

import { Check, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";

/**
 * Toast (design-system 6.7): inverse colours, one action (usually Undo) and a close button. It
 * never takes focus, dismisses itself after 10 s, pauses while hovered or focused (WCAG 2.2.1) and
 * closes with Escape when focused. It is never the only way to undo something.
 */

export const TOAST_MS = 10_000;

export interface ToastInput {
  message: string;
  kind?: "success" | "info";
  action?: { label: string; onAction: () => void };
}

interface ToastEntry extends ToastInput {
  id: number;
}

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

/** Shows a toast. Must be used under `<ToastProvider>`. */
export function useToast(): (toast: ToastInput) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const show = useCallback((toast: ToastInput) => {
    const id = ++nextId.current;
    // At most three at once; the oldest goes first.
    setToasts((list) => [...list.slice(-2), { ...toast, id }]);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* A persistent polite region, so each new toast is announced without moving focus. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 grid justify-items-center gap-2 md:right-auto md:justify-items-start"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const remaining = useRef(TOAST_MS);
  const dismiss = useCallback(() => onDismiss(toast.id), [onDismiss, toast.id]);

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(dismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [paused, dismiss]);

  return (
    <div
      className="toast motion-toast-in pointer-events-auto relative flex w-full max-w-[420px] items-center gap-3 overflow-hidden rounded-md bg-inverse-bg py-1.5 pr-1.5 pl-4 text-body-sm text-inverse-fg shadow-3"
      data-paused={paused}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") dismiss();
      }}
    >
      <span className="shrink-0 text-inverse-action" aria-hidden="true">
        {toast.kind === "info" ? <Info size={20} /> : <Check size={20} />}
      </span>
      <span className="flex-1 py-2">{toast.message}</span>
      {toast.action && (
        <Button
          variant="inverse"
          onClick={() => {
            toast.action?.onAction();
            dismiss();
          }}
        >
          {toast.action.label}
        </Button>
      )}
      <Button variant="inverse" iconOnly size="md" aria-label="Dismiss" onClick={dismiss}>
        <X size={16} aria-hidden="true" />
      </Button>
      <i className="toast-timer absolute bottom-0 left-0 h-0.5 w-full bg-inverse-action" aria-hidden="true" />
    </div>
  );
}
