"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * Menu button (design-system 6.8): `aria-haspopup="menu"` opens a `role="menu"` popover with 44 px
 * items. Arrow keys, Home and End move between items; Escape or Tab closes it and Escape returns
 * focus to the button.
 */
export type MenuItem =
  | { kind: "link"; label: string; href: string; icon?: ReactNode }
  | { kind: "action"; label: string; onSelect: () => void; icon?: ReactNode };

interface MenuButtonProps {
  /** Visible trigger content; its accessible name comes from this content. */
  trigger: ReactNode;
  triggerClassName?: string;
  menuLabel: string;
  /** Optional non-interactive header (name and email in the account menu). */
  header?: ReactNode;
  items: readonly MenuItem[];
}

const itemClass =
  "flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-sm border-0 bg-transparent px-3 text-left text-body-sm font-medium text-fg no-underline hover:bg-brand-tint focus-visible:bg-brand-tint";

export function MenuButton({ trigger, triggerClassName, menuLabel, header, items }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const menuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    const list = menuItems();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: list.length - 1 };
    if (event.key in move) {
      event.preventDefault();
      list[(move[event.key] + list.length) % list.length]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  function onButtonKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKeyDown}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onMenuKeyDown}
          className="motion-menu-in absolute top-[calc(100%+8px)] right-0 z-30 grid w-64 origin-top-right rounded-md border border-line bg-surface p-1.5 shadow-2"
        >
          {header && (
            <div role="presentation" className="mb-1 grid border-b border-line px-3 pt-2 pb-2.5">
              {header}
            </div>
          )}
          {items.map((item) =>
            item.kind === "link" ? (
              <Link key={item.label} role="menuitem" tabIndex={-1} href={item.href} className={itemClass} onClick={() => setOpen(false)}>
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                tabIndex={-1}
                type="button"
                className={itemClass}
                onClick={() => {
                  close(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
