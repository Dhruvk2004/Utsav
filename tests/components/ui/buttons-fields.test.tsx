import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/Button";
import { Checkbox, RadioCards, RadioGroup, Toggle } from "@/components/ui/Choice";
import { Combobox } from "@/components/ui/Combobox";
import { cx } from "@/components/ui/cx";
import { SelectField, TextField } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { counterLevel, TextareaField } from "@/components/ui/TextareaField";

describe("Button", () => {
  it("is a real button with a type and keeps its label while loading", () => {
    render(
      <Button loading icon={<span data-testid="icon" />}>
        Save changes
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByTestId("icon")).not.toBeInTheDocument();
  });

  it("keeps keyboard focus while busy and ignores presses, even as a form's submit button (CO-01 regression)", async () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const { rerender } = render(
      <form onSubmit={onSubmit}>
        <Button type="submit" onClick={onClick}>
          Save changes
        </Button>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Save changes" });
    button.focus();
    rerender(
      <form onSubmit={onSubmit}>
        <Button type="submit" loading onClick={onClick}>
          Save changes
        </Button>
      </form>,
    );
    // A disabled button would drop focus to <body>; a busy one keeps it.
    expect(button).not.toBeDisabled();
    expect(button).toHaveFocus();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    rerender(
      <form onSubmit={onSubmit}>
        <Button type="submit" onClick={onClick}>
          Save changes
        </Button>
      </form>,
    );
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows its icon when idle and supports variants, sizes and links", () => {
    render(
      <>
        <Button variant="danger" icon={<span data-testid="icon" />}>
          Delete
        </Button>
        <ButtonLink href="/events/new" variant="secondary" size="lg" icon={<span data-testid="link-icon" />}>
          New event
        </ButtonLink>
      </>,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).not.toHaveAttribute("aria-busy");
    expect(screen.getByRole("link", { name: "New event" })).toHaveAttribute("href", "/events/new");
    expect(buttonClasses({ iconOnly: true, block: true })).toContain("w-full");
    expect(buttonClasses()).toContain("min-h-11");
    expect(cx("a", false, null, undefined, "b")).toBe("a b");
  });
});

describe("TextField and SelectField", () => {
  it("wires label, hint, helper and error to the control", () => {
    render(<TextField id="city" label="City" hint="Where it happens." helper="About ₹7,142 per guest" error="Enter the city." optional />);
    const input = screen.getByLabelText("City (optional)");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("About ₹7,142 per guest Where it happens. Enter the city.");
  });

  it("has no description or invalid state when there is nothing to say", () => {
    render(<SelectField id="role" label="Role" options={[{ value: "a", label: "A" }]} why="Why we ask." />);
    const select = screen.getByLabelText("Role");
    expect(select).not.toHaveAttribute("aria-invalid");
    expect(select).toHaveAccessibleDescription("Why we ask.");
  });
});

describe("TextareaField", () => {
  it("counts characters and announces only near and at the limit", () => {
    function Harness() {
      const [value, setValue] = useState("");
      return (
        <TextareaField id="vibe" label="Vibe" maxLength={10} hint="A few words." value={value} onChange={(e) => setValue(e.target.value)} />
      );
    }
    render(<Harness />);
    const box = screen.getByLabelText("Vibe");
    expect(box).toHaveAccessibleDescription("A few words. 0/10");
    fireEvent.change(box, { target: { value: "12345678" } });
    expect(screen.getByText("8/10")).toBeInTheDocument();
    expect(screen.queryByText(/character limit/)).not.toBeInTheDocument();
    fireEvent.change(box, { target: { value: "123456789" } });
    expect(screen.getByText("Nearly at the 10 character limit.")).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "1234567890" } });
    expect(screen.getByText("10 character limit reached.")).toBeInTheDocument();
  });

  it("marks errors and works without a hint", () => {
    render(<TextareaField id="v" label="Vibe" optional maxLength={200} value="" error="Too long." onChange={() => {}} />);
    expect(screen.getByLabelText("Vibe (optional)")).toHaveAttribute("aria-invalid", "true");
    expect(counterLevel(180, 200)).toBe("near");
    expect(counterLevel(179, 200)).toBeNull();
  });
});

describe("MoneyField", () => {
  it("groups digits as the user types", async () => {
    function Harness() {
      const [value, setValue] = useState("");
      return <MoneyField id="budget" label="Total budget" value={value} onChange={setValue} />;
    }
    render(<Harness />);
    const input = screen.getByLabelText("Total budget");
    await userEvent.type(input, "2500000");
    expect(input).toHaveValue("25,00,000");
    expect(input).toHaveAttribute("inputmode", "numeric");
  });
});

describe("choices", () => {
  it("Checkbox reports changes and links its hint", async () => {
    const onChange = vi.fn();
    render(<Checkbox id="kids" label="Young kids" hint="Until counts exist." checked={false} onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Young kids" });
    expect(box).toHaveAccessibleDescription("Until counts exist.");
    await userEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("RadioGroup and RadioCards are native radio groups", async () => {
    const onChange = vi.fn();
    render(
      <>
        <RadioGroup
          name="lang"
          legend="Language"
          hint="Pre-filled."
          value="en"
          onChange={onChange}
          options={[
            { value: "en", label: "English" },
            { value: "hi", label: "Hindi", lang: "hi" },
          ]}
        />
        <RadioCards
          name="type"
          legend="Type"
          hint="Pick one."
          value={null}
          onChange={onChange}
          options={[{ value: "wedding", label: "Wedding", icon: <svg /> }]}
        />
      </>,
    );
    expect(screen.getByRole("group", { name: "Language" })).toHaveAccessibleDescription("Pre-filled.");
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Hindi" }));
    await userEvent.click(screen.getByRole("radio", { name: "Wedding" }));
    expect(onChange.mock.calls).toEqual([["hi"], ["wedding"]]);
  });

  it("Toggle is a named switch", async () => {
    const onChange = vi.fn();
    render(<Toggle id="parts" label="Several parts?" hint="Each gets a date." checked onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Several parts?" });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription("Each gets a date.");
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe("Combobox", () => {
  function Harness({ onChange = () => {} }: { onChange?: (v: string) => void }) {
    const [value, setValue] = useState("");
    return (
      <Combobox
        id="city"
        label="Home city"
        listLabel="City suggestions"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
        suggest={(q) => (q ? [{ value: "Pune", detail: "Maharashtra" }, { value: "Puducherry" }] : [])}
      />
    );
  }

  it("follows the ARIA combobox pattern with free text", async () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Home city" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    await userEvent.type(input, "Pu");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "City suggestions" })).toBeVisible();
    await userEvent.keyboard("{ArrowDown}");
    const first = screen.getByRole("option", { name: "Pune, Maharashtra" });
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", first.id);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{Enter}");
    expect(input).toHaveValue("Pune");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("picks with the mouse, closes with Escape and on blur, and keeps typed text", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Home city" });
    await userEvent.type(input, "Pu");
    await userEvent.click(screen.getByRole("option", { name: "Puducherry" }));
    expect(input).toHaveValue("Puducherry");
    await userEvent.type(input, "x");
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Enter}");
    expect(input).toHaveValue("Puducherryx");
    await userEvent.tab();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(onChange).toHaveBeenLastCalledWith("Puducherryx");
  });

  it("opens with the arrow key even when nothing matches", async () => {
    function Empty() {
      const [value, setValue] = useState("");
      return <Combobox id="c" label="City" listLabel="Cities" value={value} onChange={setValue} suggest={() => []} />;
    }
    render(<Empty />);
    const input = screen.getByRole("combobox", { name: "City" });
    input.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
});
