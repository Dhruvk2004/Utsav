import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineTab } from "@/components/workspace/tabs/TimelineTab";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { WorkspaceTabView } from "@/components/workspace/WorkspaceTabView";
import type { AiResult } from "@/lib/data/aiClient";
import type { PlanOperation } from "@/lib/domain/ops/schema";
import { UNDO_STALE_MESSAGE } from "@/lib/plan/commands";
import type { ApplyResult, DecideResult } from "@/lib/plan/PlanStore";
import { DECOR_CUT, proposalOf } from "../../contracts/planStoreContract";
import { renderWorkspace, testWorkspace } from "../../helpers/workspace";

/**
 * Quick successive actions in one tab (QA-19, QA-20), retrying a failed Undo from the Saved toast
 * (QA-17), and when a card says it replaces an earlier change (MQR-05).
 */

const toasts = () =>
  screen
    .getAllByRole("status")
    .find((region) => region.getAttribute("aria-live") === "polite" && region.className.includes("fixed")) as HTMLElement;
const DECOR = "Reduce Decor by 20%";
const NETWORK = "Couldn't save. Check your connection and try again.";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A promise the test resolves, to hold a store call in flight. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

async function aiCards(workspace = testWorkspace()) {
  const user = userEvent.setup();
  renderWorkspace(
    <WorkspaceFrame menuItems={[]}>
      <WorkspaceTabView />
    </WorkspaceFrame>,
    { workspace, tab: "budget", prompt: "Cut decor spend by 20%" },
  );
  await user.click(screen.getByRole("button", { name: "Suggest" }));
  await screen.findByRole("heading", { name: '3 suggestions for "Cut decor spend by 20%"' });
  return { user, workspace };
}

describe("two quick card decisions in one tab (QA-19 regression)", () => {
  it("the second waits for the first, and both cards end up applied with their own Undo", async () => {
    const workspace = testWorkspace();
    const { user } = await aiCards(workspace);
    const real = workspace.store.decide.bind(workspace.store);
    const held = gate();
    const decide = vi.spyOn(workspace.store, "decide").mockImplementationOnce(async (proposal, decisions): Promise<DecideResult> => {
      await held.opened;
      return real(proposal, decisions);
    });
    await user.click(screen.getByRole("button", { name: `Accept: ${DECOR}` }));
    await user.click(screen.getByRole("button", { name: /^Accept: Add task/ }));
    // The second decision has not been sent while the first is still saving.
    expect(decide).toHaveBeenCalledTimes(1);
    await act(async () => held.open());
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(2));
    // It was sent with the proposal the first decision left (the Decor card already accepted).
    expect(decide.mock.calls[1][0].items.find((item) => item.op.type === "adjust_budget_category")?.status).toBe("accepted");
    await waitFor(() => expect(screen.getAllByText("Applied:")).toHaveLength(2));
    expect(screen.queryByRole("button", { name: `Accept: ${DECOR}` })).not.toBeInTheDocument();
    // The newest change can be undone; the older one waits its turn, as for any two changes.
    expect(screen.getByRole("button", { name: /^Undo: Add task/ })).toBeEnabled();
    expect(within(toasts()).queryByText(/changed in another tab/)).not.toBeInTheDocument();
  });

  it("an Undo pressed while a decision is saving waits for it, then says the change is no longer the latest", async () => {
    const workspace = testWorkspace();
    const { user } = await aiCards(workspace);
    await user.click(screen.getByRole("button", { name: `Accept: ${DECOR}` }));
    const undoDecor = await screen.findByRole("button", { name: `Undo: ${DECOR}` });
    const real = workspace.store.decide.bind(workspace.store);
    const held = gate();
    vi.spyOn(workspace.store, "decide").mockImplementationOnce(async (proposal, decisions) => {
      await held.opened;
      return real(proposal, decisions);
    });
    const undo = vi.spyOn(workspace.store, "undo");
    await user.click(screen.getByRole("button", { name: /^Accept: Add task/ }));
    await user.click(undoDecor);
    expect(undo).not.toHaveBeenCalled();
    await act(async () => held.open());
    // The Undo would have reverted the task just added, so it is refused instead.
    expect(await within(toasts()).findByText(UNDO_STALE_MESSAGE)).toBeInTheDocument();
    expect(undo).not.toHaveBeenCalled();
    expect(screen.getAllByText("Applied:")).toHaveLength(2);
  });
});

describe("double-clicking Undo (QA-20 regression)", () => {
  it("sends one undo, shows the button busy while it runs, and no 'Undo unavailable' afterwards", async () => {
    const workspace = testWorkspace();
    const { user } = await aiCards(workspace);
    await user.click(screen.getByRole("button", { name: `Accept: ${DECOR}` }));
    const real = workspace.store.undo.bind(workspace.store);
    const held = gate();
    const undo = vi.spyOn(workspace.store, "undo").mockImplementationOnce(async (): Promise<ApplyResult> => {
      await held.opened;
      return real();
    });
    const button = await screen.findByRole("button", { name: `Undo: ${DECOR}` });
    await user.dblClick(button);
    expect(button).toHaveAttribute("aria-busy", "true");
    await act(async () => held.open());
    expect(await screen.findByRole("button", { name: `Accept: ${DECOR}` })).toBeInTheDocument();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Undo unavailable/)).not.toBeInTheDocument();
    expect(within(toasts()).queryByText(UNDO_STALE_MESSAGE)).not.toBeInTheDocument();
  });

  it("the Saved toast's Undo clicked twice reverts the change once", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace();
    renderWorkspace(<TimelineTab />, { workspace, tab: "timeline" });
    const checked = () => screen.getAllByRole("checkbox").map((box) => (box as HTMLInputElement).checked);
    const before = checked();
    await user.click(screen.getAllByRole("checkbox")[1]);
    await user.click(screen.getAllByRole("checkbox")[0]);
    const undo = vi.spyOn(workspace.store, "undo");
    await user.dblClick(within(toasts()).getAllByRole("button", { name: "Undo" }).at(-1) as HTMLElement);
    await waitFor(() => expect(checked()[0]).toBe(before[0]));
    expect(undo).toHaveBeenCalledTimes(1);
    // The older change is still in effect: only the newest one was undone.
    expect(checked()[1]).toBe(!before[1]);
  });
});

describe("retrying a failed Undo from the Saved toast (QA-17 regression)", () => {
  it("the failure toast offers Try again while the change can still be undone, and the retry reverts it", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace();
    renderWorkspace(<TimelineTab />, { workspace, tab: "timeline" });
    const wasChecked = (screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked;
    await user.click(screen.getAllByRole("checkbox")[0]);
    const failing = vi
      .spyOn(workspace.store, "undo")
      .mockResolvedValueOnce({ ok: false, plan: workspace.store.getPlan(), results: [], reason: NETWORK });
    await user.click(within(toasts()).getByRole("button", { name: "Undo" }));
    expect(await within(toasts()).findByText(NETWORK)).toBeInTheDocument();
    expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(!wasChecked);
    await user.click(within(toasts()).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(wasChecked));
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("no Try again once the store has dropped the change (the plan changed since)", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace();
    renderWorkspace(<TimelineTab />, { workspace, tab: "timeline" });
    await user.click(screen.getAllByRole("checkbox")[0]);
    vi.spyOn(workspace.store, "undo").mockResolvedValueOnce({
      ok: false,
      plan: workspace.store.getPlan(),
      results: [],
      reason: UNDO_STALE_MESSAGE,
    });
    vi.spyOn(workspace.store, "undoDepth").mockReturnValue(0);
    await user.click(within(toasts()).getByRole("button", { name: "Undo" }));
    expect(await within(toasts()).findByText(UNDO_STALE_MESSAGE)).toBeInTheDocument();
    expect(within(toasts()).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("a card says it replaces an earlier change only when it does (MQR-05 regression)", () => {
  /** AI mode answers every instruction with `ops`, as the model would. */
  function answering(ops: (instruction: string) => PlanOperation[]) {
    return testWorkspace("wedding", {
      ai: {
        instruct: async ({ instruction }): Promise<AiResult> => ({
          proposal: { ...proposalOf(ops(instruction)), instruction },
          recorded: false,
        }),
      },
    });
  }

  async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
    const box = screen.getByLabelText("Tell Utsav what to change");
    await user.clear(box);
    await user.type(box, text);
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    const heading = await screen.findByRole("heading", { level: 2, name: new RegExp(`for "${text}"`) });
    return heading.closest("section") as HTMLElement;
  }

  const fifteen: PlanOperation = { ...DECOR_CUT, value: -15 } as PlanOperation;

  it("'instead' on the line the earlier cut still holds is a replacement", async () => {
    const user = userEvent.setup();
    renderWorkspace(<WorkspaceFrame menuItems={[]}>{<WorkspaceTabView />}</WorkspaceFrame>, {
      workspace: answering((i) => (/instead/.test(i) ? [fifteen] : [DECOR_CUT])),
      tab: "budget",
      prompt: "",
    });
    await within(await ask(user, "Cut decor spend by 20%"))
      .findByRole("button", { name: `Accept: ${DECOR}` })
      .then((b) => user.click(b));
    const batch = await ask(user, "make that 15% instead");
    const card = within(batch).getByRole("article");
    expect(card).toHaveAccessibleName("Change Decor cut from 20% to 32%");
    expect(within(card).getByText("Replaces your earlier change")).toBeInTheDocument();
  });

  it("'rather', a hand edit since, or an undone cut gets an ordinary card", async () => {
    const user = userEvent.setup();
    const workspace = answering(() => [DECOR_CUT]);
    renderWorkspace(<WorkspaceFrame menuItems={[]}>{<WorkspaceTabView />}</WorkspaceFrame>, { workspace, tab: "budget", prompt: "" });
    await user.click(await within(await ask(user, "Cut decor spend by 20%")).findByRole("button", { name: `Accept: ${DECOR}` }));
    // "rather" asks for a further cut, not a replacement.
    const rather = await ask(user, "Cut decor spend by 20% again, rather than touching catering");
    expect(within(rather).getByRole("article")).toHaveAccessibleName(DECOR);
    expect(within(rather).queryByText("Replaces your earlier change")).not.toBeInTheDocument();
    // A hand edit since: the follow-up applies to the amount the line has now.
    await act(
      async () =>
        void (await workspace.store.applyManual([
          { type: "adjust_budget_category", lineId: "line-decor", mode: "set_amount", value: 200_000, rebalance: "change_total" },
        ])),
    );
    const edited = await ask(user, "make that 20% instead");
    expect(within(edited).queryByText("Replaces your earlier change")).not.toBeInTheDocument();
  });

  it("after the earlier cut is undone, 'instead' is an ordinary card again", async () => {
    const user = userEvent.setup();
    renderWorkspace(<WorkspaceFrame menuItems={[]}>{<WorkspaceTabView />}</WorkspaceFrame>, {
      workspace: answering((i) => (/instead/.test(i) ? [fifteen] : [DECOR_CUT])),
      tab: "budget",
      prompt: "",
    });
    await user.click(await within(await ask(user, "Cut decor spend by 20%")).findByRole("button", { name: `Accept: ${DECOR}` }));
    await user.click(await screen.findByRole("button", { name: `Undo: ${DECOR}` }));
    await screen.findByRole("button", { name: `Accept: ${DECOR}` });
    const batch = await ask(user, "make that 15% instead");
    expect(within(batch).getByRole("article")).toHaveAccessibleName("Reduce Decor by 15%");
    expect(within(batch).queryByText("Replaces your earlier change")).not.toBeInTheDocument();
  });
});
