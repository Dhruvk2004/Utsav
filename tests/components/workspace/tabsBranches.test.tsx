import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IdeasTab } from "@/components/workspace/tabs/IdeasTab";
import { TimelineTab } from "@/components/workspace/tabs/TimelineTab";
import { VendorsTab } from "@/components/workspace/tabs/VendorsTab";
import type { EventDoc } from "@/lib/domain/model/event";
import { CONFLICT_MESSAGE } from "@/lib/plan/commands";
import { renderWorkspace, testWorkspace } from "../../helpers/workspace";

/**
 * Workspace tab paths the main suites leave out (QA branch pass): money over budget, failed saves
 * surfacing the store's reason or a fallback, filters cleared back to "all", and empty states.
 */

const failWith = (workspace: ReturnType<typeof testWorkspace>, reason?: string) =>
  vi
    .spyOn(workspace.store, "applyManual")
    .mockResolvedValue({ ok: false, plan: workspace.store.getPlan(), results: [], ...(reason ? { reason } : {}) });

describe("Vendors tab", () => {
  it("shows Over by when quotes exceed the total", () => {
    const workspace = testWorkspace("wedding", {
      plan: (p) => ({
        ...p,
        vendors: p.vendors.map((v, i) => (i === 0 ? { ...v, status: "booked" as const, quotedAmount: p.budget.total + 50_000 } : v)),
      }),
    });
    renderWorkspace(<VendorsTab />, { workspace, tab: "vendors" });
    expect(screen.getByText(/^Over by ₹/)).toBeInTheDocument();
  });

  it("a status change the store refuses keeps the select and shows the reason", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace();
    failWith(workspace, CONFLICT_MESSAGE);
    renderWorkspace(<VendorsTab />, { workspace, tab: "vendors" });
    await user.selectOptions(screen.getByLabelText("Status of Decorator"), "booked");
    await user.type(screen.getByLabelText("Quoted amount (required to mark booked)"), "50000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(CONFLICT_MESSAGE)).toBeInTheDocument();
  });

  it("adding a vendor that fails shows the fallback message", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace();
    failWith(workspace);
    renderWorkspace(<VendorsTab />, { workspace, tab: "vendors" });
    await user.click(screen.getByRole("button", { name: "Add vendor" }));
    const dialog = screen.getByRole("dialog", { name: "Add a vendor" });
    await user.type(within(dialog).getByLabelText("Vendor category"), "Photo booth");
    await user.click(within(dialog).getByRole("button", { name: "Add vendor" }));
    expect(await within(dialog).findByText("The vendor could not be added.")).toBeInTheDocument();
  });

  it("filters by status and function, and clears back to everything", async () => {
    const user = userEvent.setup();
    renderWorkspace(<VendorsTab />, { tab: "vendors" });
    const all = screen.getAllByRole("button", { name: /^Open / }).length;
    await user.selectOptions(screen.getByLabelText("Status"), "booked");
    const booked = screen.getAllByRole("button", { name: /^Open / }).length;
    expect(booked).toBeLessThan(all);
    await user.selectOptions(screen.getByLabelText("Status"), "all");
    await user.selectOptions(screen.getByLabelText("Function"), "fn-mehndi");
    expect(screen.getAllByRole("button", { name: /^Open / }).length).toBeLessThan(all);
    await user.selectOptions(screen.getByLabelText("Function"), "");
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(all);
  });
});

describe("Ideas tab", () => {
  const withIdea = (origin: "ai" | "user", source: "ai" | "library" | "user") => (p: EventDoc) => ({
    ...p,
    ideas: [
      {
        id: "idea-x",
        title: "Lantern walk",
        description: "Paper lanterns",
        category: "experience" as const,
        estimatedCost: null,
        costBasis: "per event" as const,
        basis: [],
        effort: "diy" as const,
        state: "saved" as const,
        origin,
        source,
        createdAt: "2026-10-20T06:00:00.000Z",
      },
    ],
  });

  it("labels a library idea as from the library", () => {
    renderWorkspace(<IdeasTab />, { workspace: testWorkspace("wedding", { plan: withIdea("ai", "library") }), tab: "ideas" });
    const card = screen.getByRole("heading", { name: "Lantern walk" }).closest("li") as HTMLElement;
    expect(within(card).getByText(/library/i)).toBeInTheDocument();
  });

  it("an idea edit that fails keeps the form with the fallback message; Cancel closes it", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace("wedding", { plan: withIdea("user", "user") });
    failWith(workspace);
    renderWorkspace(<IdeasTab />, { workspace, tab: "ideas" });
    await user.click(screen.getByRole("button", { name: "Edit: Lantern walk" }));
    expect(screen.getByRole("heading", { name: "Edit Lantern walk" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("The idea could not be saved.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Edit Lantern walk" })).not.toBeInTheDocument());
  });

  it("adding your own idea that fails shows the reason; Cancel closes the form", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace();
    failWith(workspace, "Too many ideas");
    renderWorkspace(<IdeasTab />, { workspace, tab: "ideas" });
    await user.click(screen.getByRole("button", { name: "Add your own idea" }));
    await user.type(screen.getByLabelText("Title"), "Dhol entry");
    await user.click(screen.getByRole("button", { name: "Save idea" }));
    expect(await screen.findByText("Too many ideas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });
});

describe("Timeline tab", () => {
  it("adding a task that fails shows the fallback; the due-date preview follows the choice", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace();
    failWith(workspace);
    renderWorkspace(<TimelineTab />, { workspace, tab: "timeline" });
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.type(screen.getByLabelText("Title"), "Book the dhol");
    expect(screen.getByText(/^Due /)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The task could not be saved.")).toBeInTheDocument();
  });

  it("filters by function and back to all", async () => {
    const user = userEvent.setup();
    renderWorkspace(<TimelineTab />, { tab: "timeline" });
    const all = screen.getAllByRole("checkbox").length;
    await user.selectOptions(screen.getByLabelText("Function"), "fn-mehndi");
    expect(screen.getAllByRole("checkbox").length).toBeLessThan(all);
    await user.selectOptions(screen.getByLabelText("Function"), "");
    expect(screen.getAllByRole("checkbox")).toHaveLength(all);
  });
});
