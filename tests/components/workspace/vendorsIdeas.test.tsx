import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IdeasTab } from "@/components/workspace/tabs/IdeasTab";
import { VendorsTab } from "@/components/workspace/tabs/VendorsTab";
import { AiRequestError } from "@/lib/data/aiClient";
import { renderWorkspace, testWorkspace } from "../../helpers/workspace";

const vendor = (workspace: ReturnType<typeof testWorkspace>, id: string) => workspace.store.getPlan().vendors.find((v) => v.id === id);

describe("Vendors tab (spec 5.6)", () => {
  it("shows totals and pipeline groups, and asks for the quote before Booked", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<VendorsTab />, { tab: "vendors" });
    expect(screen.getByText("Quoted (awaiting)").parentElement).toHaveTextContent("₹45,000");
    expect(screen.getByText("Paid ₹2,000 more than quoted")).toBeInTheDocument();
    expect(screen.getByText("Not needed (1)")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status of Decorator"), "booked");
    const quote = screen.getByLabelText("Quoted amount (required to mark booked)");
    await waitFor(() => expect(quote).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByTestId("announcer")).toHaveTextContent("Status not changed"));
    expect(screen.getByLabelText("Status of Decorator")).toHaveValue("to_research");

    await user.selectOptions(screen.getByLabelText("Status of Decorator"), "paid");
    await user.type(screen.getByLabelText("Quoted amount (required to mark paid)"), "50000");
    await user.clear(screen.getByLabelText("Paid amount"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter the amount you paid.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Paid amount"), "20000");
    await user.keyboard("{Escape}");
    await user.selectOptions(screen.getByLabelText("Status of Decorator"), "booked");
    await user.clear(screen.getByLabelText(/^Quoted amount/));
    await user.type(screen.getByLabelText(/^Quoted amount/), "50000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(vendor(workspace, "vendor-decorator")).toMatchObject({ status: "booked", quotedAmount: 50_000 }));

    await user.selectOptions(screen.getByLabelText("Status of Photographer"), "quoted");
    await waitFor(() => expect(vendor(workspace, "vendor-photographer")?.status).toBe("quoted"));
    await user.selectOptions(screen.getByLabelText("Status"), "booked");
    expect(screen.queryByLabelText("Status of Photographer")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Function"), "Mehndi");
    expect(screen.queryByLabelText("Status of Decorator")).not.toBeInTheDocument();
  });

  it("edits a vendor in the drawer, drafts an enquiry and deletes or keeps vendors", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { workspace } = renderWorkspace(<VendorsTab />, { tab: "vendors" });
    await user.click(screen.getByRole("button", { name: "Open Photographer" }));
    const drawer = screen.getByRole("dialog", { name: "Photographer" });
    await user.type(within(drawer).getByLabelText(/^Your label/), "Studio near Aundh");
    await user.type(within(drawer).getByLabelText(/^Notes/), "Drone extra");

    await user.click(within(drawer).getByRole("radio", { name: "Email" }));
    await user.click(within(drawer).getByRole("checkbox", { name: "Include our budget for this" }));
    await user.click(within(drawer).getByRole("button", { name: "Draft enquiry" }));
    const body = await within(drawer).findByLabelText(/^Message/);
    expect((body as HTMLTextAreaElement).value).toContain("Hi [Vendor name],");
    expect(within(drawer).getByText("Template draft")).toBeInTheDocument();
    expect(within(drawer).getByLabelText("Subject")).toHaveValue("Enquiry: Photographer for 27 Dec 2026");
    await user.type(body, " Thanks!");
    expect(within(drawer).getByText("Edited by you")).toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalled();
    expect(within(drawer).getByRole("link", { name: "Open email" })).toHaveAttribute("href", expect.stringMatching(/^mailto:\?subject=/));
    await user.click(within(drawer).getByRole("button", { name: "Save draft" }));
    expect(await within(drawer).findByText("Saved drafts (1)")).toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: /^View/ }));
    await user.click(within(drawer).getByRole("button", { name: /^Delete draft/ }));
    await waitFor(() => expect(within(drawer).queryByText("Saved drafts (1)")).not.toBeInTheDocument());

    await user.click(within(drawer).getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(vendor(workspace, "vendor-photographer")).toMatchObject({ label: "Studio near Aundh", notes: "Drone extra" }),
    );

    await user.click(screen.getByRole("button", { name: "Open Videographer" }));
    const booked = screen.getByRole("dialog", { name: "Videographer" });
    await user.clear(within(booked).getByLabelText(/^Quoted/));
    await user.click(within(booked).getByRole("button", { name: "Save changes" }));
    expect(await within(booked).findByRole("alert")).toHaveTextContent("Add the quoted amount for Videographer first");
    await user.click(within(booked).getByRole("button", { name: "Delete vendor" }));
    const blocked = screen.getByRole("dialog", { name: "Videographer can't be deleted yet" });
    expect(blocked).toHaveTextContent("counts as committed");
    await user.click(within(blocked).getAllByRole("button", { name: "Close" }).at(-1)!);
    await user.click(within(booked).getByRole("button", { name: "Mark not needed" }));
    await waitFor(() => expect(vendor(workspace, "vendor-videographer")?.status).toBe("not_needed"));

    await user.click(screen.getByRole("button", { name: "Open Pandit" }));
    const pandit = screen.getByRole("dialog", { name: "Pandit" });
    await user.click(within(pandit).getByRole("button", { name: "Delete vendor" }));
    await user.click(within(screen.getByRole("dialog", { name: "Delete Pandit?" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(vendor(workspace, "vendor-pandit")).toBeUndefined());
  });

  it("shows an error when a draft cannot be made", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace("wedding", { ai: { enquiry: async () => Promise.reject(new AiRequestError("unavailable")) } });
    renderWorkspace(<VendorsTab />, { tab: "vendors", workspace });
    await user.click(screen.getByRole("button", { name: "Open Decorator" }));
    await user.click(screen.getByRole("button", { name: "Draft enquiry" }));
    expect(await screen.findByText("A draft could not be made right now. Try again in a moment.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
  });

  it("adds a vendor, and shows read-only details in the demo", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<VendorsTab />, { tab: "vendors" });
    await user.click(screen.getByRole("button", { name: "Add vendor" }));
    await user.type(screen.getByLabelText("Vendor category"), "Photo booth");
    await user.click(within(screen.getByRole("dialog", { name: "Add a vendor" })).getByRole("button", { name: "Add vendor" }));
    await waitFor(() => expect(workspace.store.getPlan().vendors.some((v) => v.category === "Photo booth")).toBe(true));
  });

  it("is read-only in the demo and has an empty state", async () => {
    const user = userEvent.setup();
    renderWorkspace(<VendorsTab />, { tab: "vendors", workspace: testWorkspace("birthday", { editable: false }), sample: "birthday" });
    expect(screen.queryByRole("combobox", { name: /Status of/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Details Baker" }));
    expect(screen.getByRole("dialog", { name: "Baker" })).toHaveTextContent("Can the cake be eggless?");
  });

  it("offers to add or suggest vendors when there are none", async () => {
    const user = userEvent.setup();
    renderWorkspace(<VendorsTab />, { tab: "vendors", workspace: testWorkspace("birthday", { plan: (p) => ({ ...p, vendors: [] }) }) });
    await user.click(screen.getByRole("button", { name: "Add a vendor category" }));
    expect(screen.getByRole("dialog", { name: "Add a vendor" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
  });
});

describe("Ideas tab (spec 5.7)", () => {
  it("suggests ideas into a strip, saves them all, and dismisses with restore", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<IdeasTab />, { tab: "ideas", workspace: testWorkspace("birthday") });
    expect(screen.getByText(/turning 6 · birthday girl/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Decor" }));
    await user.type(screen.getByLabelText(/Anything specific/), "cheap");
    await user.click(screen.getByRole("button", { name: "Suggest ideas" }));
    const card = await screen.findByRole("article", { name: "Idea: Peppa's muddy-puddle corner" });
    expect(within(card).getByText("Why this idea: loves Peppa Pig, turning 6")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Dismiss: Idea: Peppa's muddy-puddle corner" }));
    expect(workspace.store.getPlan().dismissedIdeaTitles).toContain("peppas muddypuddle corner");
    await user.click(screen.getByRole("button", { name: "Restore: Idea: Peppa's muddy-puddle corner" }));
    await user.click(screen.getByRole("button", { name: "Save all (3)" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Saved (7)" })).toBeInTheDocument());
  });

  it("adds a saved idea to the plan as Suggested by Utsav cards, edits and deletes ideas", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<IdeasTab />, { tab: "ideas", workspace: testWorkspace("birthday") });
    await user.click(screen.getByRole("button", { name: "Add to plan: Mini art kits as return gifts" }));
    const taskCard = await screen.findByRole("article", { name: "Add task: Arrange: Mini art kits as return gifts" });
    expect(within(taskCard).getByText("Suggested by Utsav")).toBeInTheDocument();
    await user.click(within(taskCard).getByRole("button", { name: /^Accept/ }));
    await waitFor(() =>
      expect(workspace.store.getPlan().tasks.some((t) => t.title === "Arrange: Mini art kits as return gifts")).toBe(true),
    );

    await user.click(screen.getByRole("button", { name: "Edit: Peppa Pig decor and cake" }));
    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Peppa decor");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("heading", { name: "Peppa decor" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete: Peppa decor" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Peppa decor" })).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Add your own idea" }));
    await user.type(screen.getByLabelText("Title"), "Bubble machine");
    await user.click(screen.getByRole("button", { name: "Save idea" }));
    expect(await screen.findByRole("heading", { name: "Bubble machine" })).toBeInTheDocument();
  });

  it("saves or dismisses ideas from a new plan, edits personalisation and clears dismissed titles", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace("birthday", { plan: (p) => ({ ...p, ideas: p.ideas.map((i) => ({ ...i, state: "suggested" })) }) });
    renderWorkspace(<IdeasTab />, { tab: "ideas", workspace });
    expect(screen.getByRole("heading", { name: "From your new plan (not saved yet)" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save: Peppa Pig decor and cake" }));
    await user.click(screen.getByRole("button", { name: "Dismiss: Mini art kits as return gifts" }));
    await waitFor(() => expect(screen.getByText(/Dismissed ideas won't be suggested again \(1\)/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Clear list" }));
    await waitFor(() => expect(workspace.store.getPlan().dismissedIdeaTitles).toEqual([]));

    await user.click(screen.getByRole("button", { name: "Edit personalisation" }));
    await user.clear(screen.getByLabelText(/^Theme/));
    await user.type(screen.getByLabelText(/^Theme/), "Rainbow");
    await user.click(screen.getByRole("button", { name: "Vegetarian" }));
    await user.click(screen.getByRole("switch", { name: "Guests with mobility needs" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(workspace.store.getPlan()).toMatchObject({
        details: { theme: "Rainbow", dietary: ["jain", "veg"] },
        flags: { mobility: true },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Edit personalisation" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
  });

  it("explains a failed suggestion and shows an empty saved list", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace("birthday", {
      plan: (p) => ({ ...p, ideas: [] }),
      ai: { ideas: async () => Promise.reject(new AiRequestError("unavailable")) },
    });
    renderWorkspace(<IdeasTab />, { tab: "ideas", workspace });
    expect(screen.getByRole("heading", { name: "No ideas yet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Suggest ideas" }));
    expect(await screen.findByText("Could not get suggestions.")).toBeInTheDocument();
  });

  it("says demo changes are not saved, and offers no Add to plan", () => {
    renderWorkspace(<IdeasTab />, { tab: "ideas", workspace: testWorkspace("community", { editable: false }), sample: "community" });
    expect(screen.getByText("Sample: try it, changes are not saved")).toBeInTheDocument();
    expect(screen.getByText("Sandbox: live AI, or a recorded example when it is busy.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add to plan/ })).not.toBeInTheDocument();
    expect(screen.getByText("Why this idea: Diwali, community event, 150 kids")).toBeInTheDocument();
  });
});
