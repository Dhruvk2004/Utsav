import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GuestsTab } from "@/components/workspace/tabs/GuestsTab";
import { OverviewTab } from "@/components/workspace/tabs/OverviewTab";
import { TimelineTab } from "@/components/workspace/tabs/TimelineTab";
import { renderWorkspace, testWorkspace } from "../../helpers/workspace";

const task = (title: string) => screen.getByRole("checkbox", { name: title });

describe("Overview tab (spec 5.3)", () => {
  it("shows money, this week, functions, vendors and ideas, and edits the summary", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<OverviewTab />);
    expect(screen.getByText("₹13,82,000")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Budget committed" })).toHaveAttribute("aria-valuetext", "45% committed");
    expect(screen.getByText("Vendor demand is high around Christmas; book early.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "By function" })).toHaveAttribute("href", "/events/e1/budget?view=functions");
    expect(screen.getByRole("rowheader", { name: "Reception" })).toBeInTheDocument();
    expect(screen.getByText("Fusion haldi")).toBeInTheDocument();
    await user.click(task("Book makeup artist"));
    await waitFor(() => expect(workspace.store.getPlan().tasks.find((t) => t.id === "task-book-makeup-artist")?.done).toBe(true));

    await user.click(screen.getByRole("button", { name: /edit\s*summary/i }));
    const box = screen.getByLabelText("Summary");
    await user.clear(box);
    await user.type(box, "Shorter summary.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Shorter summary.")).toBeInTheDocument();
    expect(screen.queryByText("AI", { selector: "span" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /edit\s*summary/i }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
  });

  it("explains a template start, empty weeks and ideas waiting for review", () => {
    const workspace = testWorkspace("birthday", {
      plan: (p) => ({
        ...p,
        source: "template",
        summary: { text: "", origin: "code" },
        budget: { ...p.budget },
        vendors: [],
        ideas: p.ideas.map((i) => ({ ...i, state: "suggested" })),
        tasks: p.tasks.map((t) => ({ ...t, done: true, doneAt: "2026-10-01T00:00:00.000Z" })),
      }),
    });
    renderWorkspace(<OverviewTab />, { workspace });
    expect(screen.getByText("Started from a template because AI was unavailable.")).toBeInTheDocument();
    expect(screen.getByText("Nothing due this week.")).toBeInTheDocument();
    expect(screen.getByText("No summary yet.")).toBeInTheDocument();
    expect(screen.getByText("No saved ideas yet.")).toBeInTheDocument();
    expect(screen.getByText("4 ideas")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Functions" })).not.toBeInTheDocument();
  });

  it("shows task states as text in the read-only demo", () => {
    renderWorkspace(<OverviewTab />, { workspace: testWorkspace("wedding", { editable: false }), sample: "wedding" });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText("Book makeup artist")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit\s*summary/i })).not.toBeInTheDocument();
  });
});

describe("Timeline tab (spec 5.5)", () => {
  it("groups tasks by phase with function milestones, filters and shows progress", async () => {
    const user = userEvent.setup();
    renderWorkspace(<TimelineTab />, { tab: "timeline" });
    expect(screen.getByText("12 of 34 done · 35%")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Event days" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "After the event" })).toBeInTheDocument();
    expect(screen.getByText(/Reception · Mon 28 Dec · 7:30 pm – 11:30 pm/)).toBeInTheDocument();
    expect(screen.getAllByText("Rushed").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("radio", { name: "Done" }));
    expect(screen.queryByRole("checkbox", { name: "Book makeup artist" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Overdue" }));
    expect(task("Book makeup artist")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "All" }));
    await user.selectOptions(screen.getByLabelText("Function"), "Sangeet");
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText("Function"), "Haldi");
    await user.click(screen.getByRole("radio", { name: "Done" }));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByText(/Haldi · Fri 25 Dec/)).toBeInTheDocument();
  });

  it("adds, edits, completes and deletes tasks", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<TimelineTab />, { tab: "timeline" });
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(screen.getByLabelText("Title")).toHaveFocus();
    await user.type(screen.getByLabelText("Title"), "Book a dhol player");
    await user.selectOptions(screen.getAllByLabelText("Function").at(-1)!, "Sangeet");
    await user.click(screen.getByRole("radio", { name: "Days after the event" }));
    await user.clear(screen.getByLabelText("Days"));
    await user.type(screen.getByLabelText("Days"), "2");
    expect(screen.getByText("Due Tue 29 Dec 2026")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "On a date" }));
    expect(screen.getByText("Finish the fields above to see the change.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByLabelText("Due date")).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("radio", { name: "Days before the event" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(workspace.store.getPlan().tasks.some((t) => t.title === "Book a dhol player" && t.daysBefore === 2)).toBe(true),
    );

    await user.click(screen.getByRole("button", { name: "Book decorator actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Book the decorator");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("checkbox", { name: "Book the decorator" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Book the decorator actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Mark as done" }));
    await waitFor(() => expect(task("Book the decorator")).toBeChecked());
    await user.click(screen.getByRole("button", { name: "Book the decorator actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Mark as to do" }));
    await user.click(screen.getByRole("button", { name: "Book the decorator actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Book the decorator" })).not.toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: "Undo" }).at(-1)!);
    expect(await screen.findByRole("checkbox", { name: "Book the decorator" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Book the decorator actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
  });

  it("shows an empty state that offers AI", async () => {
    const user = userEvent.setup();
    renderWorkspace(<TimelineTab />, { tab: "timeline", workspace: testWorkspace("birthday", { plan: (p) => ({ ...p, tasks: [] }) }) });
    expect(screen.getByRole("heading", { name: "No tasks yet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(screen.getByRole("heading", { name: "Add a task" })).toBeInTheDocument();
  });
});

describe("Guests tab (spec 5.8)", () => {
  it("validates counts with an error summary and saves them", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<GuestsTab />, { tab: "guests", workspace: testWorkspace("birthday") });
    expect(screen.getByText("Plates: 45 (40 + 10% buffer)")).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Adults/));
    await user.type(screen.getByLabelText(/^Adults/), "10");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Save counts" }));
    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent("Fix 1 thing to save");
    await waitFor(() => expect(summary).toHaveFocus());
    await user.clear(screen.getByLabelText(/^Adults/));
    await user.type(screen.getByLabelText(/^Adults/), "15");
    await user.clear(screen.getByLabelText(/^Elderly/));
    await user.type(screen.getByLabelText(/^Elderly/), "3");
    await user.click(screen.getByRole("button", { name: "Save counts" }));
    await waitFor(() => expect(workspace.store.getPlan().guests.elderly).toBe(3));
    expect(workspace.store.getPlan().flags.elderly).toBe(true);
    await user.clear(screen.getByLabelText(/^Catering buffer/));
    expect(screen.getByText("Enter the guest count and buffer to estimate plates.")).toBeInTheDocument();
  });
});
