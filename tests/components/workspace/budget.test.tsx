import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BudgetTab } from "@/components/workspace/tabs/BudgetTab";
import { AiRequestError } from "@/lib/data/aiClient";
import { setUrl } from "../../helpers/navigation";
import { renderWorkspace, testWorkspace } from "../../helpers/workspace";

const amount = (category: string) => screen.getByLabelText(`${category}, allocated amount`);

describe("Budget tab (spec 5.4)", () => {
  it("rebalances the other rows on an amount edit, tags them and announces it", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<BudgetTab />, { tab: "budget" });
    await user.clear(amount("Decor"));
    await user.type(amount("Decor"), "190000{Enter}");
    await waitFor(() =>
      expect(screen.getByTestId("announcer")).toHaveTextContent(
        "Saved. Decor set to ₹1,90,000. Venue and 7 other categories adjusted; total unchanged at ₹25,00,000.",
      ),
    );
    expect(screen.getAllByText("Adjusted")).toHaveLength(8);
    expect(screen.getByText("Edited by you")).toBeInTheDocument();
    expect(amount("Venue")).toHaveValue("5,25,000");
    expect(screen.getByText("Over by ₹30,000")).toBeInTheDocument();
    expect(workspace.store.getPlan().budget.total).toBe(2_500_000);
  });

  it("changes the total in that mode, edits by percent and ignores unchanged or blank cells", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<BudgetTab />, { tab: "budget" });
    await user.click(screen.getByRole("radio", { name: "Change the total" }));
    const percent = screen.getByLabelText("Decor, percent");
    await user.clear(percent);
    await user.type(percent, "10");
    await user.tab();
    await waitFor(() => expect(workspace.store.getPlan().budget.lines.find((l) => l.id === "line-decor")?.amount).toBe(250_000));
    expect(workspace.store.getPlan().budget.total).toBe(2_450_000);
    const version = workspace.store.getPlan().version;
    await user.click(amount("Venue"));
    await user.tab();
    await user.clear(amount("Venue"));
    await user.keyboard("{Escape}");
    await user.tab();
    expect(amount("Venue")).toHaveValue("5,00,000");
    await user.clear(percent);
    await user.tab();
    expect(workspace.store.getPlan().version).toBe(version);
  });

  it("renames, notes and deletes categories through the row menu, never Contingency", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<BudgetTab />, { tab: "budget" });
    await user.click(screen.getByRole("button", { name: "Contingency actions" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Edit note"]);
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Decor actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const name = screen.getByLabelText("Category name");
    await user.clear(name);
    await user.type(name, "Flowers");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("rowheader", { name: "Flowers" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Flowers actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit note" }));
    await user.type(within(screen.getByRole("dialog")).getByLabelText(/^Note/), "Pastel only");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Pastel only")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Photography actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Photography?" });
    expect(within(dialog).getByText(/2 vendors will move to Contingency: Videographer, Photographer\./)).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Move its amount and vendors to"), "Venue");
    expect(within(dialog).getByText(/will move to Venue/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(workspace.store.getPlan().budget.lines.some((l) => l.id === "line-photography")).toBe(false));
  });

  it("shows a refused rename in the dialog", async () => {
    const user = userEvent.setup();
    renderWorkspace(<BudgetTab />, { tab: "budget" });
    await user.click(screen.getByRole("button", { name: "Decor actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const name = screen.getByLabelText("Category name");
    await user.clear(name);
    await user.type(name, "Venue");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('There is already a category called "Venue"');
    await user.click(screen.getByRole("button", { name: "Cancel" }));
  });

  it("adds a category from Contingency", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<BudgetTab />, { tab: "budget" });
    await user.click(screen.getByRole("button", { name: "Add category" }));
    expect(screen.getByLabelText("Category name")).toHaveFocus();
    await user.type(screen.getByLabelText("Category name"), "Fireworks");
    await user.type(screen.getByLabelText("Amount"), "2000000");
    await user.click(screen.getAllByRole("button", { name: "Add category" }).at(-1)!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Contingency has only ₹1,50,000");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "20000");
    await user.click(screen.getAllByRole("button", { name: "Add category" }).at(-1)!);
    await waitFor(() => expect(workspace.store.getPlan().budget.lines.at(-1)?.category).toBe("Fireworks"));
    await user.click(screen.getByRole("button", { name: "Add category" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
  });

  it("edits function shares in the By function view", async () => {
    const user = userEvent.setup();
    setUrl("/events/e1/budget?view=functions");
    const { workspace } = renderWorkspace(<BudgetTab />, { tab: "budget" });
    expect(screen.getByRole("region", { name: "Budget by function" })).toBeInTheDocument();
    const share = screen.getByLabelText("Sangeet, share percent");
    await user.clear(share);
    await user.type(share, "20{Enter}");
    await waitFor(() => expect(screen.getByTestId("announcer")).toHaveTextContent("Sangeet share set to 20%"));
    expect(workspace.store.getPlan().functions.find((f) => f.id === "fn-sangeet")?.amount).toBe(500_000);
    await user.click(screen.getByRole("radio", { name: "By category" }));
  });

  it("is read-only in the demo", () => {
    renderWorkspace(<BudgetTab />, { tab: "budget", workspace: testWorkspace("wedding", { editable: false }), sample: "wedding" });
    expect(screen.getByText("Read-only in the sample · change it with AI mode")).toBeInTheDocument();
    expect(screen.queryByLabelText("Decor, allocated amount")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What if?" })).toBeInTheDocument();
  });
});

describe("What-if sheet (spec 6.4)", () => {
  async function open(user: ReturnType<typeof userEvent.setup>, total = "2200000") {
    await user.click(screen.getByRole("button", { name: "Change total / What if?" }));
    const field = screen.getByLabelText("New total");
    await user.clear(field);
    await user.type(field, total);
    return screen.getByRole("dialog", { name: "What if the budget changes?" });
  }

  it("rescales, pins edited rows, explains the gap and applies the table", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<BudgetTab />, { tab: "budget" });
    const sheet = await open(user);
    expect(within(sheet).getByText("₹3,00,000 less")).toBeInTheDocument();
    expect(within(sheet).getByText(/Every category × 0\.88/)).toBeInTheDocument();
    // No internal function names in the copy (QA-12 regression).
    expect(within(sheet).queryByText(/rescaleBudget/)).not.toBeInTheDocument();
    expect(within(sheet).getByText(/Function amounts will follow their shares: Haldi ₹2,20,000/)).toBeInTheDocument();
    expect(within(sheet).getByText("Some categories would go below what is already booked.")).toBeInTheDocument();
    const decor = within(sheet).getByLabelText("Decor, amount after");
    await user.clear(decor);
    await user.type(decor, "250000{Enter}");
    await waitFor(() =>
      expect(screen.getByTestId("announcer")).toHaveTextContent(/Decor set to ₹2,50,000\. 8 other rows adjusted; total ₹22,00,000\./),
    );
    expect(within(sheet).getByText("Edited by you")).toBeInTheDocument();

    for (const line of [
      "Venue",
      "Catering",
      "Attire & jewellery",
      "Photography",
      "Entertainment",
      "Invitations & gifts",
      "Makeup & mehndi",
      "Contingency",
    ]) {
      await user.click(within(sheet).getByRole("checkbox", { name: `Include ${line}` }));
    }
    expect(within(sheet).getByRole("button", { name: "Apply selected" })).toBeDisabled();
    expect(within(sheet).getByText(/Adjust one more row so the total is ₹22,00,000/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole("checkbox", { name: "Include Venue" }));
    await user.click(within(sheet).getByRole("button", { name: "Apply selected" }));
    await waitFor(() => expect(workspace.store.getPlan().budget.total).toBe(2_200_000));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks for a usable total", async () => {
    const user = userEvent.setup();
    renderWorkspace(<BudgetTab />, { tab: "budget" });
    const sheet = await open(user, "5");
    expect(within(sheet).getByText("Enter a total from ₹1,000.")).toBeInTheDocument();
    expect(within(sheet).getByText("Enter a new total to compare.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
  });

  it("generates a smart re-plan with ignored categories, notes and trade-off cards", async () => {
    const user = userEvent.setup();
    renderWorkspace(<BudgetTab />, { tab: "budget" });
    const sheet = await open(user);
    await user.click(within(sheet).getByRole("button", { name: "Catering" }));
    await user.type(within(sheet).getByLabelText(/Anything else/), "Keep the reception grand");
    await user.click(within(sheet).getByRole("button", { name: "Generate smart re-plan" }));
    expect(await within(sheet).findByText(/Ignored “Fireworks”/)).toBeInTheDocument();
    expect(within(sheet).getByRole("radio", { name: /Smart re-plan/ })).toBeChecked();
    expect(within(sheet).getByText("Venue and catering are mostly booked, so they move least.")).toBeInTheDocument();
    expect(within(sheet).getByRole("article", { name: "Idea: DJ and dhol instead of a live band at the sangeet" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    await user.click(within(sheet).getByRole("radio", { name: /Simple rescale/ }));
    expect(within(sheet).queryByText(/Ignored/)).not.toBeInTheDocument();
  });

  it("falls back to Simple rescale when smart re-plan fails", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace("wedding", { ai: { whatif: async () => Promise.reject(new AiRequestError("unavailable")) } });
    renderWorkspace(<BudgetTab />, { tab: "budget", workspace });
    const sheet = await open(user);
    await user.click(within(sheet).getByRole("button", { name: "Generate smart re-plan" }));
    expect(await within(sheet).findByText("Smart re-plan is unavailable right now.")).toBeInTheDocument();
    expect(within(sheet).getByRole("radio", { name: /Simple rescale/ })).toBeChecked();
  });

  it("applies a sample rescale in the demo", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace("wedding", { editable: false });
    renderWorkspace(<BudgetTab />, { tab: "budget", workspace, sample: "wedding" });
    await user.click(screen.getByRole("button", { name: "What if?" }));
    const sheet = screen.getByRole("dialog", { name: "What if? (sample)" });
    expect(within(sheet).queryByRole("button", { name: "Generate smart re-plan" })).not.toBeInTheDocument();
    const field = within(sheet).getByLabelText("New total");
    await user.clear(field);
    await user.type(field, "2600000");
    expect(within(sheet).getByText("₹1,00,000 more")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Apply to sample" }));
    await waitFor(() => expect(workspace.store.getPlan().budget.total).toBe(2_600_000));
  });
});
