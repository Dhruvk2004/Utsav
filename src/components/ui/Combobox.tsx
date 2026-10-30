"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { cx } from "./cx";
import { Field, type FieldProps, inputClasses, labelId } from "./Field";

/**
 * Combobox with free text (design-system 6.2, ARIA 1.2 pattern): suggestions filter as the user
 * types, arrow keys move the active option, Enter picks it, Escape closes the list, and anything
 * typed is accepted as is.
 */
export interface ComboOption {
  value: string;
  /** Optional second part shown after the value, e.g. the state for a city. */
  detail?: string;
}

type ComboboxProps = Omit<FieldProps, "children"> & {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  suggest: (query: string) => ComboOption[];
  listLabel: string;
  autoComplete?: string;
};

export function Combobox({ value, onChange, onBlur, suggest, listLabel, autoComplete = "off", ...field }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const options = open ? suggest(value) : [];
  const expanded = options.length > 0;
  const optionId = (i: number) => `${listId}-option-${i}`;

  function pick(option: ComboOption) {
    onChange(option.value);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (event.key === "Enter" && expanded && active >= 0) {
      event.preventDefault();
      pick(options[active]);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <Field {...field}>
      {(control) => (
        <div className="relative">
          <input
            {...control}
            type="text"
            role="combobox"
            aria-labelledby={labelId(field.id)}
            aria-controls={listId}
            aria-expanded={expanded}
            aria-autocomplete="list"
            aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
            autoComplete={autoComplete}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              setOpen(false);
              onBlur?.();
            }}
            className={inputClasses()}
          />
          <ul
            id={listId}
            role="listbox"
            aria-label={listLabel}
            hidden={!expanded}
            className="absolute inset-x-0 top-[calc(100%+4px)] z-20 m-0 grid list-none rounded-md border border-line bg-surface p-1.5 shadow-2"
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                // Pointer down keeps focus in the input, so blur does not close the list first.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                className={cx("flex min-h-11 cursor-pointer items-center rounded-sm px-2.5 text-body-sm", i === active && "bg-brand-tint")}
              >
                <b className="font-semibold">{o.value}</b>
                {o.detail && <span className="text-fg-muted">, {o.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Field>
  );
}
