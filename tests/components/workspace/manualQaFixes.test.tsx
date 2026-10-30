import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiPanel } from "@/components/ai/AiPanel";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { BudgetTab } from "@/components/workspace/tabs/BudgetTab";
import { IdeasTab } from "@/components/workspace/tabs/IdeasTab";
import { OverviewTab } from "@/components/workspace/tabs/OverviewTab";
import { VendorsTab } from "@/components/workspace/tabs/VendorsTab";
import { AiRequestError } from "@/lib/data/aiClient";
import type { Workspace } from "@/lib/data/workspaces";
import type { EventDoc } from "@/lib/domain/model/event";
import type { Proposal } from "@/lib/domain/model/records";
import { noRecordingDraft } from "@/lib/demo/recordings";
import { buildProposal } from "@/lib/plan/proposals";
import { whatifInstruction } from "@/lib/plan/smartPlan";
import { TODAY } from "../../domainFixtures";
import { media } from "../../helpers/media";
import { NOW, renderWorkspace, testWorkspace } from "../../helpers/workspace";

/** Regression tests for the manual QA findings (docs/qa-report.md, "Senior Software Engineer: fixes for the manual QA findings"). */

const DHOL = { type: "add_task", title: "Book a dhol player", category: "Entertainment", daysBefore: 30 } as const;

function waiting(workspace: Workspace): Proposal {
  const proposal = buildProposal(
    workspace.store.getPlan(),
    { touchpoint: "instruct", origin: "ai", instruction: "Plan the extras", items: [{ op: DHOL }] },
    { today: TODAY, now: NOW },
  );
  return { ...proposal, id: "p-waiting" };
}

function withAi(workspace: Workspace, extra: Partial<Workspace>): Workspace {
  return { ...workspace, ...extra };
}

describe("waiting suggestions after a reload (CO-02, MQW-02, BP-03)", () => {
  it("loads them into AI mode, counts them on the AI mode button and lets them be decided", async () => {
    const user = userEvent.setup();
    media.wide = true;
    const base = testWorkspace();
    const workspace = withAi(base, { waitingProposals: vi.fn(async () => [waiting(base)]) });
    renderWorkspace(
      <>
        <WorkspaceHeader menuItems={[]} />
        <AiPanel />
      </>,
      { workspace },
    );
    const button = await screen.findByRole("button", { name: /AI mode, 1 suggestions waiting/ });
    await user.click(button);
    const panel = screen.getByRole("complementary", { name: "AI mode" });
    expect(within(panel).getByText(/Waiting for your decision from earlier/)).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Accept: Add task: Book a dhol player" }));
    await waitFor(() => expect(base.store.getPlan().tasks.some((task) => task.title === "Book a dhol player")).toBe(true));
  });

  it("says a restored What-if trade-off came from What-if and which total (MQR-04)", async () => {
    media.wide = true;
    const base = testWorkspace();
    const tradeoff = buildProposal(
      base.store.getPlan(),
      {
        touchpoint: "whatif",
        origin: "ai",
        instruction: whatifInstruction(2_000_000, ""),
        items: [{ op: { type: "add_task", title: "Ask for a buffet quote", category: "Catering", daysBefore: 30 } }],
      },
      { today: TODAY, now: NOW },
    );
    renderWorkspace(<AiPanel />, {
      workspace: withAi(base, { waitingProposals: async () => [{ ...tradeoff, id: "p-whatif" }] }),
      prompt: "x",
    });
    const panel = screen.getByRole("complementary", { name: "AI mode" });
    expect(await within(panel).findByRole("heading", { name: "1 trade-off from What-if: New total ₹20,00,000" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Accept: Add task: Ask for a buffet quote" })).toBeInTheDocument();
  });

  it("shows waiting idea suggestions on the Ideas tab, and survives a failed load", async () => {
    const base = testWorkspace();
    const ideas = buildProposal(
      base.store.getPlan(),
      {
        touchpoint: "ideas",
        origin: "ai",
        instruction: "",
        items: [
          {
            op: {
              type: "add_idea",
              idea: {
                title: "Marigold welcome arch",
                description: "",
                category: "decor",
                estimatedCost: null,
                costBasis: "per event",
                basis: [],
                effort: "vendor",
              },
            },
          },
        ],
      },
      { today: TODAY, now: NOW },
    );
    renderWorkspace(<IdeasTab />, {
      workspace: withAi(base, { waitingProposals: async () => [{ ...ideas, id: "p-ideas" }] }),
      tab: "ideas",
    });
    expect(await screen.findByRole("heading", { name: "New suggestions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save: Idea: Marigold welcome arch" })).toBeInTheDocument();
  });

  it("keeps working when the waiting suggestions can't be loaded", async () => {
    const base = testWorkspace();
    renderWorkspace(<IdeasTab />, {
      workspace: withAi(base, { waitingProposals: async () => Promise.reject(new Error("offline")) }),
      tab: "ideas",
    });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "New suggestions" })).not.toBeInTheDocument());
  });
});

describe("no AI on the deployment (MQW-07, CO-08)", () => {
  it("says so in AI mode, offers no examples and keeps Suggest off", async () => {
    media.wide = true;
    renderWorkspace(<AiPanel />, { workspace: withAi(testWorkspace(), { aiAvailable: false }), prompt: "Add a task to buy 2000 diyas" });
    const panel = screen.getByRole("complementary", { name: "AI mode" });
    expect(within(panel).getByText(/AI suggestions aren't available on this deployment/)).toBeInTheDocument();
    expect(within(panel).queryByRole("group", { name: "Example instructions" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Suggest" })).toBeDisabled();
  });

  it("explains a not-configured answer without a Retry that can't work", async () => {
    const user = userEvent.setup();
    media.wide = true;
    const workspace = testWorkspace("wedding", { ai: { instruct: async () => Promise.reject(new AiRequestError("not_configured")) } });
    renderWorkspace(<AiPanel />, { workspace, prompt: "Add a task", tab: "budget" });
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    const alert = (await screen.findByText("AI suggestions aren't available on this deployment.")).closest("[role=status]") as HTMLElement;
    expect(alert).toHaveTextContent("AI suggestions aren't available on this deployment.");
    expect(within(alert).queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(within(alert).getByRole("link", { name: "Edit Budget manually" })).toBeInTheDocument();
  });

  it("turns off Generate smart re-plan in What-if and says why", async () => {
    const user = userEvent.setup();
    renderWorkspace(<BudgetTab />, { workspace: withAi(testWorkspace(), { aiAvailable: false }), tab: "budget" });
    await user.click(screen.getByRole("button", { name: "Change total / What if?" }));
    const generate = screen.getByRole("button", { name: "Generate smart re-plan" });
    expect(generate).toBeDisabled();
    expect(generate).toHaveAccessibleDescription(/AI isn't available on this deployment, so Smart re-plan is off/);
  });
});

describe("recorded demo answers (MQW-08)", () => {
  it("labels recorded cards Recorded, and says live AI is off rather than busy when it is", async () => {
    const user = userEvent.setup();
    media.wide = true;
    const base = testWorkspace("wedding", { editable: false });
    const instruct = vi.fn(async () => ({
      ...(await base.ai.instruct({ instruction: "cut decor", tab: "budget", previousTurns: [] })),
      reason: "off" as const,
    }));
    renderWorkspace(<AiPanel />, {
      workspace: { ...base, ai: { ...base.ai, instruct } },
      sample: "wedding",
      prompt: "Cut decor spend by 20%",
    });
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    expect(await screen.findByText("Recorded example - live AI is off in this demo")).toBeInTheDocument();
    expect(screen.queryByText(/live AI is busy/)).not.toBeInTheDocument();
    const card = screen.getAllByRole("article")[0];
    expect(within(card).getByText("Recorded")).toBeInTheDocument();
    expect(within(card).queryByText("AI suggestion")).not.toBeInTheDocument();
  });
});

describe("demo with no live AI (MQR-03)", () => {
  it("offers only the recorded examples and says so up front", async () => {
    media.wide = true;
    const base = testWorkspace("wedding", { editable: false });
    renderWorkspace(<AiPanel />, {
      workspace: { ...base, aiAvailable: false },
      sample: "wedding",
      tab: "overview",
      prompt: "Add a photo booth",
    });
    const chips = within(screen.getByRole("group", { name: "Example instructions" })).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual(["Cut decor spend by 20%", "Make that 15% instead"]);
    expect(screen.getByText("Live AI is off in this demo, so only the recorded examples below have answers.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggest" })).not.toBeDisabled();
  });

  it("keeps the event's own chips when live AI is on", () => {
    media.wide = true;
    const base = testWorkspace("wedding", { editable: false });
    renderWorkspace(<AiPanel />, {
      workspace: { ...base, aiAvailable: true },
      sample: "wedding",
      tab: "overview",
      prompt: "Add a photo booth",
    });
    expect(within(screen.getByRole("group", { name: "Example instructions" })).getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByText(/only the recorded examples/)).not.toBeInTheDocument();
  });

  it("does not label a reply with no cards as a recorded example or count 0 valid", async () => {
    const user = userEvent.setup();
    media.wide = true;
    const base = testWorkspace("wedding", { editable: false });
    const instruct = vi.fn(async () => ({
      proposal: buildProposal(base.store.getPlan(), noRecordingDraft("wedding", "What's overdue?", "off"), { today: TODAY, now: NOW }),
      recorded: true,
      reason: "off" as const,
    }));
    renderWorkspace(<AiPanel />, { workspace: { ...base, ai: { ...base.ai, instruct } }, sample: "wedding", prompt: "What's overdue?" });
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    expect(await screen.findByText(/recorded examples only cover/)).toBeInTheDocument();
    expect(screen.queryByText(/^Recorded example/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 valid/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("announcer")).toHaveTextContent("Answer ready"));
  });
});

describe("What-if (MQW-03, MQW-04, BP-02, CO-01, CO-03)", () => {
  async function open(user: ReturnType<typeof userEvent.setup>, total = "1200000") {
    await user.click(screen.getByRole("button", { name: "Change total / What if?" }));
    const field = screen.getByLabelText("New total");
    await user.clear(field);
    await user.type(field, total);
    return screen.getByRole("dialog", { name: "What if the budget changes?" });
  }

  it("keeps protected categories under Simple rescale and says so", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<BudgetTab />, { tab: "budget" });
    const sheet = await open(user, "2200000");
    const venue = workspace.store.getPlan().budget.lines.find((line) => line.id === "line-venue")!;
    await user.click(within(sheet).getByRole("button", { name: "Venue" }));
    expect(within(sheet).getByLabelText("Venue, amount after")).toHaveValue(new Intl.NumberFormat("en-IN").format(venue.amount));
    expect(within(sheet).getByText("Adjusted by Utsav to protect Venue")).toBeInTheDocument();
    expect(within(sheet).getByText(/Protected categories keep at least their current amount/)).toBeInTheDocument();
  });

  it("gives the before/after table its full height in the sheet", async () => {
    const user = userEvent.setup();
    renderWorkspace(<BudgetTab />, { tab: "budget" });
    const sheet = await open(user);
    const region = within(sheet).getByRole("region", { name: "Budget before and after" });
    expect(region).toHaveClass("min-h-max");
    // MQR-01: the sheet body's grid rows size to their content, so later items start below the table.
    // jsdom has no layout; e2e/demo.spec.ts measures the real boxes at 1366x800.
    expect(region.parentElement).toHaveClass("auto-rows-max", "content-start", "overflow-y-auto");
  });

  it("returns focus to Change total / What if? after Apply selected", async () => {
    const user = userEvent.setup();
    renderWorkspace(<BudgetTab />, { tab: "budget" });
    const sheet = await open(user, "2600000");
    await user.click(within(sheet).getByRole("button", { name: "Apply selected" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Change total / What if?" })).toHaveFocus());
  });

  it("keeps focus in the sheet while re-planning, moves it to the table, and to Undo after accepting a trade-off", async () => {
    const user = userEvent.setup();
    renderWorkspace(<BudgetTab />, { tab: "budget" });
    const sheet = await open(user, "2200000");
    await user.click(within(sheet).getByRole("button", { name: "Generate smart re-plan" }));
    await waitFor(() => expect(within(sheet).getByRole("region", { name: "Budget before and after" })).toHaveFocus());
    await waitFor(() => expect(screen.getByTestId("announcer")).toHaveTextContent(/Smart re-plan ready/));
    const card = within(sheet).getByRole("article", { name: "Idea: DJ and dhol instead of a live band at the sangeet" });
    await user.click(within(card).getByRole("button", { name: /^Accept/ }));
    await waitFor(() => expect(within(sheet).getByRole("button", { name: /^Undo: / })).toHaveFocus());
  });
});

describe("Budget table (BP-04, CO-06)", () => {
  it("shows one card per category with a Details expander on a phone", async () => {
    const user = userEvent.setup();
    media.narrow = true;
    renderWorkspace(<BudgetTab />, { tab: "budget" });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const cards = screen.getByRole("region", { name: "Budget by category" });
    expect(within(cards).getByRole("heading", { name: "Decor" })).toBeInTheDocument();
    expect(within(cards).getByLabelText("Decor, allocated amount")).toBeVisible();
    expect(within(cards).getByRole("button", { name: "Decor actions" })).toBeInTheDocument();
    const details = within(cards).getAllByText("Details")[0].closest("details")!;
    await user.click(within(details).getByText("Details"));
    expect(details).toHaveAttribute("open");
    expect(within(details).getByText("Committed")).toBeInTheDocument();
  });

  it("shows read-only cards with an over-allocation in the demo", () => {
    media.narrow = true;
    renderWorkspace(<BudgetTab />, { tab: "budget", workspace: testWorkspace("wedding", { editable: false }), sample: "wedding" });
    const cards = screen.getByRole("region", { name: "Budget by category" });
    expect(within(cards).queryByLabelText("Decor, allocated amount")).not.toBeInTheDocument();
    expect(within(cards).queryByRole("button", { name: "Decor actions" })).not.toBeInTheDocument();
    expect(within(cards).getByText(/^Over by ₹/)).toBeInTheDocument();
    expect(within(cards).getByText("Always kept")).toBeInTheDocument();
  });

  it("puts a refused percent back and marks the cell invalid with the reason", async () => {
    const user = userEvent.setup();
    const { workspace } = renderWorkspace(<BudgetTab />, { tab: "budget" });
    const percent = screen.getByLabelText("Decor, percent");
    const saved = (percent as HTMLInputElement).value;
    const version = workspace.store.getPlan().version;
    await user.clear(percent);
    await user.type(percent, "150");
    await user.tab();
    await waitFor(() => expect(percent).toHaveValue(saved));
    expect(percent).toHaveAttribute("aria-invalid", "true");
    expect(percent).toHaveAccessibleDescription(/.+/);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(workspace.store.getPlan().version).toBe(version);
    await user.type(percent, "1");
    expect(percent).not.toHaveAttribute("aria-invalid");
  });
});

describe("focus after replacing controls (CO-01)", () => {
  it("follows a vendor to its new column after a status change", async () => {
    const user = userEvent.setup();
    renderWorkspace(<VendorsTab />, { tab: "vendors" });
    await user.selectOptions(screen.getByLabelText("Status of Decorator"), "contacted");
    await waitFor(() => expect(screen.getByLabelText("Status of Decorator")).toHaveFocus());
    expect(screen.getByLabelText("Status of Decorator")).toHaveValue("contacted");
  });

  it("returns focus to the vendor's Open button after Save changes", async () => {
    const user = userEvent.setup();
    renderWorkspace(<VendorsTab />, { tab: "vendors" });
    await user.click(screen.getByRole("button", { name: "Open Decorator" }));
    const drawer = screen.getByRole("dialog", { name: "Decorator" });
    await user.type(within(drawer).getByLabelText(/Notes/), "Wants a site visit");
    await user.click(within(drawer).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Decorator" })).toHaveFocus());
  });

  it("announces new idea suggestions and focuses their heading", async () => {
    const user = userEvent.setup();
    renderWorkspace(<IdeasTab />, { tab: "ideas" });
    await user.click(screen.getByRole("button", { name: "Suggest ideas" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "New suggestions" })).toHaveFocus());
    await waitFor(() => expect(screen.getByTestId("announcer")).toHaveTextContent(/new ideas?\. Not saved until you save them\./));
  });

  it("announces and focuses an enquiry draft", async () => {
    const user = userEvent.setup();
    renderWorkspace(<VendorsTab />, { tab: "vendors" });
    await user.click(screen.getByRole("button", { name: "Open Photographer" }));
    await user.click(screen.getByRole("button", { name: "Draft enquiry" }));
    await waitFor(() => expect(screen.getByLabelText(/^Message/)).toHaveFocus());
    await waitFor(() => expect(screen.getByTestId("announcer")).toHaveTextContent(/draft ready\. Review it before sending\./i));
  });
});

describe("over-payments (CO-07)", () => {
  const overpaid = (plan: EventDoc): EventDoc => ({
    ...plan,
    vendors: plan.vendors.map((v) =>
      v.id === "vendor-caterer" ? { ...v, status: "paid" as const, quotedAmount: 75_000, paidAmount: 90_000 } : v,
    ),
  });

  it("calls out money paid above quotes next to Remaining on Overview and Vendors", () => {
    const workspace = testWorkspace("wedding", { plan: overpaid });
    const { unmount } = renderWorkspace(<OverviewTab />, { workspace });
    expect(screen.getByText("Paid above quotes").nextSibling).toHaveTextContent("₹17,000");
    unmount();
    renderWorkspace(<VendorsTab />, { workspace, tab: "vendors" });
    expect(screen.getByText(/^Paid above quotes/)).toHaveTextContent("₹17,000");
  });
});
