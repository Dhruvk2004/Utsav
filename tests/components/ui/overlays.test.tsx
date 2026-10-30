import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider, useAnnounce } from "@/components/ui/Announcer";
import { Dialog } from "@/components/ui/Dialog";
import { MenuButton } from "@/components/ui/Menu";
import { TOAST_MS, ToastProvider, useToast, type ToastInput } from "@/components/ui/Toast";

afterEach(() => vi.useRealTimers());

describe("Dialog", () => {
  function Harness({ variant }: { variant?: "dialog" | "sheet" }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Delete event
        </button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Delete this event?"
          variant={variant}
          wide
          actions={
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          }
        >
          <p>This cannot be undone.</p>
        </Dialog>
        <span data-testid="state">{open ? "open" : "closed"}</span>
      </>
    );
  }

  it("opens modally with its title and returns focus to the opener on close", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Delete event" });
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Delete this event?" });
    expect(dialog).toHaveAttribute("open");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
    expect(opener).toHaveFocus();
  });

  it("closes when the parent closes it, as a sheet too", async () => {
    render(<Harness variant="sheet" />);
    await userEvent.click(screen.getByRole("button", { name: "Delete event" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute("open");
  });
});

describe("MenuButton", () => {
  function renderMenu(onSelect = vi.fn()) {
    render(
      <>
        <MenuButton
          trigger="Account"
          menuLabel="Account menu"
          header={<b>Ananya</b>}
          items={[
            { kind: "link", label: "Settings", href: "/settings" },
            { kind: "action", label: "Sign out", onSelect },
          ]}
        />
        <button type="button">Elsewhere</button>
      </>,
    );
    return { trigger: screen.getByRole("button", { name: "Account" }), onSelect };
  }

  it("opens on click, focuses the first item and moves with arrow keys", async () => {
    const { trigger } = renderMenu();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(items[1]).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(items[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(items[1]).toHaveFocus();
    await userEvent.keyboard("x");
    expect(items[1]).toHaveFocus();
  });

  it("closes with Escape back to the button, and with Tab or an outside click", async () => {
    const { trigger } = renderMenu();
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menu", { name: "Account menu" })).toBeInTheDocument();
    await userEvent.tab();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByText("Ananya"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("runs actions and follows links", async () => {
    const { trigger, onSelect } = renderMenu();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(onSelect).toHaveBeenCalled();
    await userEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/settings");
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  });
});

describe("Toast", () => {
  function Shower({ toast }: { toast: ToastInput }) {
    const show = useToast();
    return (
      <button type="button" onClick={() => show(toast)}>
        Show
      </button>
    );
  }

  function renderToast(toast: ToastInput) {
    render(
      <ToastProvider>
        <Shower toast={toast} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
  }

  it("shows in a polite region without taking focus and dismisses after 10 s", () => {
    vi.useFakeTimers();
    renderToast({ message: "Applied 2 changes." });
    expect(screen.getByRole("status")).toHaveTextContent("Applied 2 changes.");
    expect(screen.getByRole("button", { name: "Show" })).not.toHaveFocus();
    act(() => vi.advanceTimersByTime(TOAST_MS));
    expect(screen.queryByText("Applied 2 changes.")).not.toBeInTheDocument();
  });

  it("pauses while hovered or focused and resumes with the time left", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    renderToast({ message: "Applied.", kind: "info", action: { label: "Undo", onAction } });
    const toast = screen.getByText("Applied.").parentElement as HTMLElement;
    act(() => vi.advanceTimersByTime(4_000));
    fireEvent.mouseEnter(toast);
    expect(toast).toHaveAttribute("data-paused", "true");
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText("Applied.")).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    const undo = screen.getByRole("button", { name: "Undo" });
    act(() => undo.focus());
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText("Applied.")).toBeInTheDocument();
    act(() => undo.blur());
    act(() => vi.advanceTimersByTime(5_999));
    expect(screen.getByText("Applied.")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("Applied.")).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("runs the action, closes with the close button or Escape, and keeps at most three", () => {
    const onAction = vi.fn();
    renderToast({ message: "One.", action: { label: "Undo", onAction } });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onAction).toHaveBeenCalled();
    expect(screen.queryByText("One.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("One.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    fireEvent.focus(dismiss);
    fireEvent.blur(dismiss, { relatedTarget: screen.getByRole("button", { name: "Undo" }) });
    fireEvent.keyDown(dismiss, { key: "Enter" });
    expect(screen.getByText("One.")).toBeInTheDocument();
    fireEvent.keyDown(dismiss, { key: "Escape" });
    expect(screen.queryByText("One.")).not.toBeInTheDocument();

    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getAllByText("One.")).toHaveLength(3);
  });

  it("must be used inside its provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Shower toast={{ message: "x" }} />)).toThrow("useToast must be used inside <ToastProvider>");
  });
});

describe("Announcer", () => {
  function Speaker({ message }: { message: string }) {
    const announce = useAnnounce();
    return (
      <button type="button" onClick={() => announce(message)}>
        Save
      </button>
    );
  }

  it("announces through one polite region and repeats identical messages", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <AnnouncerProvider>
        <Speaker message="Saved." />
      </AnnouncerProvider>,
    );
    const region = screen.getByTestId("announcer");
    expect(region).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    act(() => vi.advanceTimersByTime(50));
    expect(region).toHaveTextContent("Saved.");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(region).toHaveTextContent("");
    act(() => vi.advanceTimersByTime(50));
    expect(region).toHaveTextContent("Saved.");
    unmount();
  });

  it("must be used inside its provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Speaker message="x" />)).toThrow("useAnnounce must be used inside <AnnouncerProvider>");
  });
});
