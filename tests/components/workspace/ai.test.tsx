import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { WorkspaceTabView } from "@/components/workspace/WorkspaceTabView";
import { AiRequestError, type AiResult } from "@/lib/data/aiClient";
import { media } from "../../helpers/media";
import { renderWorkspace, testWorkspace } from "../../helpers/workspace";

const frame = <WorkspaceFrame menuItems={[]}>{<WorkspaceTabView />}</WorkspaceFrame>;

async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
  const box = screen.getByLabelText("Tell Utsav what to change");
  await user.clear(box);
  await user.type(box, text);
  await user.click(screen.getByRole("button", { name: "Suggest" }));
  return screen.findByRole("heading", { level: 2, name: new RegExp(`suggestions? for "${text}"`, "i") });
}

describe("AI mode panel and suggestion cards (spec 6.1, 6.3)", () => {
  it("opens with Ctrl+K, fills from a chip and closes back to the AI mode button", async () => {
    const user = userEvent.setup();
    media.wide = true;
    renderWorkspace(frame, { tab: "budget" });
    await user.keyboard("{Control>}k{/Control}");
    const panel = screen.getByRole("complementary", { name: "AI mode" });
    expect(within(panel).getByLabelText("Tell Utsav what to change")).toHaveFocus();
    expect(within(panel).getByRole("button", { name: "Suggest" })).toBeDisabled();
    await user.click(within(panel).getByRole("button", { name: /Keep the total under/ }));
    expect(within(panel).getByLabelText("Tell Utsav what to change")).toHaveValue("Keep the total under ₹23,75,000");
    await user.keyboard("{Control>}k{/Control}");
    expect(within(panel).getByLabelText("Tell Utsav what to change")).toHaveFocus();
    await user.click(within(panel).getByRole("button", { name: "Close AI mode" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^AI mode/ })).toHaveFocus();
  });

  it("moves focus through accept, undo, decline, restore and accept all", async () => {
    const user = userEvent.setup();
    renderWorkspace(frame, { tab: "budget", prompt: "Cut decor spend by 20%" });
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    const heading = await screen.findByRole("heading", { name: '3 suggestions for "Cut decor spend by 20%"' });
    await waitFor(() => expect(heading).toHaveFocus());
    await waitFor(() => expect(screen.getByTestId("announcer")).toHaveTextContent("3 suggestions, 3 valid"));
    expect(screen.getByText("Recorded example - live AI is busy")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept: Reduce Decor by 20%" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Undo: Reduce Decor by 20%" })).toHaveFocus());
    expect(screen.getAllByText("₹24,40,000").length).toBeGreaterThan(0);

    const idea = "Idea: Reuse haldi marigolds for mehndi";
    await user.click(screen.getByRole("button", { name: `Decline: ${idea}` }));
    await waitFor(() => expect(screen.getByRole("button", { name: `Restore: ${idea}` })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: `Restore: ${idea}` }));
    await waitFor(() => expect(screen.getByRole("button", { name: `Accept: ${idea}` })).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Accept all valid (2)" }));
    const summary = await screen.findByText("2 applied");
    await waitFor(() => expect(summary.closest('[role="status"]')).toHaveFocus());
    expect(screen.queryByRole("button", { name: "Undo: Reduce Decor by 20%" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Undo unavailable: the plan changed after this.")).toHaveLength(1);
    await user.click(within(summary.closest('[role="status"]') as HTMLElement).getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: `Accept: ${idea}` })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo: Reduce Decor by 20%" }));
    expect(await screen.findByRole("button", { name: "Accept: Reduce Decor by 20%" })).toBeInTheDocument();
  });

  it("edits a card in place: first field focused, Cancel back to Edit, Save and accept to Undo", async () => {
    const user = userEvent.setup();
    renderWorkspace(frame, { tab: "budget", prompt: "Cut decor spend by 20%" });
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    await user.click(await screen.findByRole("button", { name: "Edit: Reduce Decor by 20%" }));
    expect(screen.getByRole("radio", { name: "By %" })).toHaveFocus();
    expect(screen.getByText("Edited by you")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit: Reduce Decor by 20%" })).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Edit: Reduce Decor by 20%" }));
    const value = screen.getByLabelText("Amount or percent");
    await user.clear(value);
    await user.type(value, "-10");
    expect(screen.getByText("₹2,70,000")).toBeInTheDocument();
    await user.clear(value);
    await user.click(screen.getByRole("button", { name: "Save and accept" }));
    expect(screen.getByText("Enter a value")).toBeInTheDocument();
    await user.type(value, "-10");
    await user.click(screen.getByRole("button", { name: "Save and accept" }));
    // The applied line and its Undo name the edited change, not the model's title (MQW-05, BP-05 regression).
    await waitFor(() => expect(screen.getByRole("button", { name: "Undo: Reduce Decor by 10%" })).toHaveFocus());
    expect(screen.getByText(/\(edited by you\)/)).toHaveTextContent("Reduce Decor by 10% (edited by you)");
    expect(screen.queryByText(/Reduce Decor by 20%/)).not.toBeInTheDocument();
    // Undo puts the card back undecided and focus on its Accept (CO-01 regression).
    await user.click(screen.getByRole("button", { name: "Undo: Reduce Decor by 10%" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept: Reduce Decor by 10%" })).toHaveFocus());
  });

  it("shows a refused edit and keeps the form", async () => {
    const user = userEvent.setup();
    renderWorkspace(frame, { tab: "budget", prompt: "Cut decor spend by 20%" });
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    await user.click(await screen.findByRole("button", { name: "Edit: Reduce Decor by 20%" }));
    const value = screen.getByLabelText("Amount or percent");
    await user.clear(value);
    await user.type(value, "-200");
    await user.click(screen.getByRole("button", { name: "Save and accept" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Decor can't go below ₹0");
  });

  it("labels a follow-up that replaces an earlier change and keeps its title once applied", async () => {
    const user = userEvent.setup();
    renderWorkspace(frame, { tab: "budget", prompt: "Cut decor spend by 20%" });
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    await user.click(await screen.findByRole("button", { name: "Accept: Reduce Decor by 20%" }));
    await ask(user, "make that 15% instead");
    const card = screen.getByRole("article", { name: "Change Decor cut from 20% to 15%" });
    expect(within(card).getByText("Replaces your earlier change")).toBeInTheDocument();
    expect(screen.getByText(/Earlier: “Cut decor spend by 20%” · 1 applied/)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Accept: Change Decor cut from 20% to 15%" }));
    expect(await screen.findByRole("button", { name: "Undo: Change Decor cut from 20% to 15%" })).toBeInTheDocument();
  });

  it("marks cards that no longer apply and lets invalid ones be dismissed", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace("wedding");
    renderWorkspace(frame, { workspace, tab: "budget", prompt: "Cut decor spend by 20%" });
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    await screen.findByRole("article", { name: "Reduce Decor by 20%" });
    await act(() => workspace.store.applyManual([{ type: "remove_budget_category", lineId: "line-decor" }]));
    const stale = screen.getByRole("article", { name: "Reduce Decor by 20% (₹3,00,000 -> ₹2,40,000)" });
    expect(within(stale).getByText("No longer applies")).toBeInTheDocument();
    expect(within(stale).getByText(/The plan changed since this was suggested/)).toBeInTheDocument();
    await user.click(within(stale).getByRole("button", { name: /^Dismiss: Reduce Decor by 20%/ }));
    expect(screen.queryByRole("article", { name: /^Reduce Decor/ })).not.toBeInTheDocument();
  });

  it.each([
    [new AiRequestError("unavailable"), "Could not get suggestions."],
    [new AiRequestError("rate_limited", 18), "Try again in 18 minutes."],
    [new Error("boom"), "Your plan is unchanged."],
  ])("explains a failed request (%s)", async (error, text) => {
    const user = userEvent.setup();
    let calls = 0;
    const workspace = testWorkspace("wedding", {
      ai: {
        instruct: async () => {
          calls += 1;
          throw error;
        },
      },
    });
    renderWorkspace(frame, { workspace, tab: "timeline", prompt: "Move the sangeet to Friday" });
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    const retry = screen.queryByRole("button", { name: "Retry" });
    if (retry) {
      expect(screen.getByRole("link", { name: "Edit Timeline manually" })).toHaveAttribute("href", "/events/e1/timeline");
      await user.click(retry);
      await waitFor(() => expect(calls).toBe(2));
    }
  });

  it("offers Reset sample when the sandbox got out of step, and Cancel while waiting", async () => {
    const user = userEvent.setup();
    let reject: (e: unknown) => void = () => {};
    const workspace = testWorkspace("wedding", {
      editable: false,
      ai: {
        instruct: (_request, signal) =>
          new Promise((_, no) => {
            reject = no;
            signal?.addEventListener("abort", () => no(new DOMException("Aborted", "AbortError")));
          }),
      },
    });
    let resets = 0;
    renderWorkspace(
      <WorkspaceFrame menuItems={[]} onReset={() => (resets += 1)}>
        {<WorkspaceTabView />}
      </WorkspaceFrame>,
      { workspace, sample: "wedding", prompt: "x" },
    );
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    expect(screen.getByText("Getting suggestions")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Getting suggestions")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    await act(async () => reject(new AiRequestError("sandbox_invalid")));
    await user.click(await screen.findByRole("button", { name: "Reset sample" }));
    expect(resets).toBe(1);
    expect(screen.getByRole("heading", { name: "Try AI mode" })).toBeInTheDocument();
  });

  it("does not steal focus when the user moved elsewhere while waiting", async () => {
    const user = userEvent.setup();
    let resolve: (value: AiResult) => void = () => {};
    const base = testWorkspace("wedding");
    const workspace = { ...base, ai: { ...base.ai, instruct: () => new Promise<AiResult>((yes) => (resolve = yes)) } };
    renderWorkspace(
      <>
        <input aria-label="Elsewhere" />
        {frame}
      </>,
      { workspace, tab: "budget", prompt: "Cut decor spend by 20%" },
    );
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    await user.click(screen.getByLabelText("Elsewhere"));
    await act(async () => resolve(await base.ai.instruct({ instruction: "Cut decor spend by 20%", tab: "budget", previousTurns: [] })));
    await screen.findByRole("heading", { name: '3 suggestions for "Cut decor spend by 20%"' });
    expect(screen.getByLabelText("Elsewhere")).toHaveFocus();
  });
});
