import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuestsTab } from "@/components/workspace/tabs/GuestsTab";
import { IdeasTab } from "@/components/workspace/tabs/IdeasTab";
import { TimelineTab } from "@/components/workspace/tabs/TimelineTab";
import {
  EDIT_FAILED_MESSAGE,
  OFFLINE_MESSAGE,
  UNDO_FAILED_MESSAGE,
  useWorkspace,
  type WorkspaceValue,
} from "@/components/workspace/WorkspaceContext";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { WorkspaceTabView } from "@/components/workspace/WorkspaceTabView";
import { CONFLICT_MESSAGE, UNDO_STALE_MESSAGE } from "@/lib/plan/commands";
import { renderWorkspace, testWorkspace } from "../../helpers/workspace";

const toasts = () =>
  screen
    .getAllByRole("status")
    .find((region) => region.getAttribute("aria-live") === "polite" && region.className.includes("fixed")) as HTMLElement;

function setOnline(online: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

const NETWORK = "Couldn't save. Check your connection and try again.";
const DECOR = "Reduce Decor by 20%";

/** The AI panel over the budget tab with the recorded "Cut decor" answer on screen. */
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

/** Renders a probe that exposes the workspace context to the test. */
function probe(workspace = testWorkspace()) {
  const ref: { current: WorkspaceValue | null } = { current: null };
  function Probe() {
    ref.current = useWorkspace();
    return null;
  }
  renderWorkspace(<Probe />, { workspace });
  return { ref, workspace, ctx: () => ref.current as WorkspaceValue };
}

describe("failed manual edits are reported (spec 3.4, QA-02 regression)", () => {
  it("a version conflict on a task checkbox shows the conflict toast", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace();
    const apply = vi
      .spyOn(workspace.store, "applyManual")
      .mockResolvedValue({ ok: false, plan: workspace.store.getPlan(), results: [], reason: CONFLICT_MESSAGE });
    renderWorkspace(<TimelineTab />, { workspace, tab: "timeline" });
    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(await within(toasts()).findByText(CONFLICT_MESSAGE)).toBeInTheDocument();
    expect(within(toasts()).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("a failure without a reason (network or server error) still says the change was not saved", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace();
    vi.spyOn(workspace.store, "applyManual").mockResolvedValue({ ok: false, plan: workspace.store.getPlan(), results: [] });
    renderWorkspace(<IdeasTab />, { workspace, tab: "ideas" });
    await user.click(screen.getAllByRole("button", { name: /^Delete: / })[0]);
    expect(await within(toasts()).findByText(EDIT_FAILED_MESSAGE)).toBeInTheDocument();
  });

  it("a form that shows the reason itself gets no second message in a toast", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace();
    vi.spyOn(workspace.store, "applyManual").mockResolvedValue({
      ok: false,
      plan: workspace.store.getPlan(),
      results: [],
      reason: CONFLICT_MESSAGE,
    });
    renderWorkspace(<GuestsTab />, { workspace, tab: "guests" });
    await user.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(screen.getAllByText(CONFLICT_MESSAGE).length).toBeGreaterThan(0));
    expect(within(toasts()).queryByText(CONFLICT_MESSAGE)).not.toBeInTheDocument();
  });
});

describe("offline (spec 3.4, QA-03 regression)", () => {
  it("shows the banner, disables the tab's controls and refuses edits until the connection returns", async () => {
    const workspace = testWorkspace();
    const apply = vi.spyOn(workspace.store, "applyManual");
    renderWorkspace(
      <WorkspaceFrame menuItems={[]}>
        <TimelineTab />
      </WorkspaceFrame>,
      { workspace, tab: "timeline" },
    );
    const task = screen.getAllByRole("checkbox")[0];
    expect(task).toBeEnabled();
    expect(screen.queryByText(OFFLINE_MESSAGE)).not.toBeInTheDocument();

    setOnline(false);
    expect(screen.getByText(OFFLINE_MESSAGE)).toBeInTheDocument();
    expect(task).toBeDisabled();
    // The AI mode button sits outside the tab content and stays reachable.
    expect(screen.getByRole("button", { name: /^AI mode/ })).toBeEnabled();
    expect(apply).not.toHaveBeenCalled();

    setOnline(true);
    expect(screen.queryByText(OFFLINE_MESSAGE)).not.toBeInTheDocument();
    expect(task).toBeEnabled();
  });

  it("refuses an edit made while offline without calling the server", async () => {
    const workspace = testWorkspace();
    const apply = vi.spyOn(workspace.store, "applyManual");
    let edit: ((...args: Parameters<typeof workspace.store.applyManual>) => Promise<unknown>) | undefined;
    const { useWorkspace } = await import("@/components/workspace/WorkspaceContext");
    function Probe() {
      edit = useWorkspace().edit;
      return null;
    }
    renderWorkspace(<Probe />, { workspace });
    setOnline(false);
    const result = await act(async () => edit?.([{ type: "set_summary", text: "Offline" }]));
    expect(result).toMatchObject({ ok: false, reason: OFFLINE_MESSAGE });
    expect(apply).not.toHaveBeenCalled();
    expect(within(toasts()).getByText(OFFLINE_MESSAGE)).toBeInTheDocument();
  });

  it("never shows the banner in the demo, whose sample plan saves nothing", () => {
    renderWorkspace(
      <WorkspaceFrame menuItems={[]}>
        <TimelineTab />
      </WorkspaceFrame>,
      { workspace: testWorkspace("wedding", { editable: false }), tab: "timeline", sample: "wedding" },
    );
    setOnline(false);
    expect(screen.queryByText(OFFLINE_MESSAGE)).not.toBeInTheDocument();
  });
});

describe("AI cards offline and failed decisions (spec 3.4, QA-03 reopened regression)", () => {
  it("disables Accept, Edit, Decline and Accept all valid offline, and enables them again online", async () => {
    await aiCards();
    const controls = () => [
      screen.getByRole("button", { name: `Accept: ${DECOR}` }),
      screen.getByRole("button", { name: `Edit: ${DECOR}` }),
      screen.getByRole("button", { name: `Decline: ${DECOR}` }),
      screen.getByRole("button", { name: /^Accept all valid/ }),
    ];
    for (const control of controls()) expect(control).toBeEnabled();
    setOnline(false);
    for (const control of controls()) expect(control).toBeDisabled();
    setOnline(true);
    for (const control of controls()) expect(control).toBeEnabled();
  });

  it("disables an accepted card's Undo offline", async () => {
    const { user } = await aiCards();
    await user.click(screen.getByRole("button", { name: `Accept: ${DECOR}` }));
    const undo = await screen.findByRole("button", { name: `Undo: ${DECOR}` });
    setOnline(false);
    expect(undo).toBeDisabled();
  });

  it("refuses a decision made offline without calling the store, and says why", async () => {
    const { ctx, workspace } = probe();
    const decide = vi.spyOn(workspace.store, "decide");
    setOnline(false);
    const proposal = await workspace.createProposal({
      touchpoint: "reset",
      origin: "code",
      instruction: "",
      items: [{ op: { type: "set_summary", text: "Offline" } }],
    });
    const { result, batch } = await act(async () => ctx().decide(proposal, [{ itemId: proposal.items[0].id, action: "accept" }]));
    expect(result).toMatchObject({ reason: OFFLINE_MESSAGE, results: [{ ok: false, reason: OFFLINE_MESSAGE }] });
    expect(batch).toBeNull();
    expect(decide).not.toHaveBeenCalled();
    expect(within(toasts()).getByText(OFFLINE_MESSAGE)).toBeInTheDocument();
  });

  it("a decision whose request failed shows the reason in a toast and keeps the card's Accept", async () => {
    const workspace = testWorkspace();
    const { user } = await aiCards(workspace);
    vi.spyOn(workspace.store, "decide").mockImplementation(async (proposal, decisions) => ({
      plan: workspace.store.getPlan(),
      proposal,
      results: decisions.map((d) => ({ itemId: d.itemId, ok: false, reason: NETWORK })),
      reason: NETWORK,
    }));
    await user.click(screen.getByRole("button", { name: `Accept: ${DECOR}` }));
    expect(await within(toasts()).findByText(NETWORK)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Accept: ${DECOR}` })).toBeEnabled();
  });

  it("the card's Edit form shows a failed request inline only, not again in a toast", async () => {
    const workspace = testWorkspace();
    const { user } = await aiCards(workspace);
    vi.spyOn(workspace.store, "decide").mockImplementation(async (proposal, decisions) => ({
      plan: workspace.store.getPlan(),
      proposal,
      results: decisions.map((d) => ({ itemId: d.itemId, ok: false, reason: NETWORK })),
      reason: NETWORK,
    }));
    await user.click(screen.getByRole("button", { name: `Edit: ${DECOR}` }));
    await user.click(screen.getByRole("button", { name: "Save and accept" }));
    await waitFor(() => expect(screen.getAllByText(NETWORK).length).toBeGreaterThan(0));
    expect(within(toasts()).queryByText(NETWORK)).not.toBeInTheDocument();
  });
});

describe("failed undo is reported and can be retried (QA-17 regression)", () => {
  it("the Saved toast's Undo reports a failed request, and the task stays ticked", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace();
    renderWorkspace(<TimelineTab />, { workspace, tab: "timeline" });
    const task = screen.getAllByRole("checkbox")[0];
    const wasChecked = (task as HTMLInputElement).checked;
    await user.click(task);
    vi.spyOn(workspace.store, "undo").mockResolvedValue({ ok: false, plan: workspace.store.getPlan(), results: [], reason: NETWORK });
    await user.click(within(toasts()).getByRole("button", { name: "Undo" }));
    expect(await within(toasts()).findByText(NETWORK)).toBeInTheDocument();
    expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(!wasChecked);
  });

  it("a failure without a reason still says the undo did not happen", async () => {
    const { ctx, workspace } = probe();
    await act(async () => ctx().edit([{ type: "set_summary", text: "Mine" }]));
    vi.spyOn(workspace.store, "undo").mockResolvedValue({ ok: false, plan: workspace.store.getPlan(), results: [] });
    const batch = ctx().latestBatch as number;
    expect(await act(async () => ctx().undo(batch))).toBe(false);
    expect(within(toasts()).getByText(UNDO_FAILED_MESSAGE)).toBeInTheDocument();
    // The store kept its entry, so the same Undo is still offered and works on a retry.
    expect(ctx().latestBatch).toBe(batch);
    vi.mocked(workspace.store.undo).mockRestore();
    expect(await act(async () => ctx().undo(batch))).toBe(true);
    expect(ctx().plan.summary.text).not.toBe("Mine");
  });

  it("an Undo that is no longer the latest change says so instead of doing nothing", async () => {
    const { ctx, workspace } = probe();
    const undo = vi.spyOn(workspace.store, "undo");
    await act(async () => ctx().edit([{ type: "set_summary", text: "First" }]));
    const first = ctx().latestBatch as number;
    await act(async () => ctx().edit([{ type: "set_summary", text: "Second" }]));
    expect(await act(async () => ctx().undo(first))).toBe(false);
    expect(within(toasts()).getByText(UNDO_STALE_MESSAGE)).toBeInTheDocument();
    expect(undo).not.toHaveBeenCalled();
  });

  it("refuses an undo offline without calling the store", async () => {
    const { ctx, workspace } = probe();
    await act(async () => ctx().edit([{ type: "set_summary", text: "Mine" }]));
    const undo = vi.spyOn(workspace.store, "undo");
    setOnline(false);
    expect(await act(async () => ctx().undo(ctx().latestBatch as number))).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    expect(within(toasts()).getAllByText(OFFLINE_MESSAGE).length).toBeGreaterThan(0);
  });

  it("drops Undo once the store drops its history (a conflict), so an old toast never reverts another change", async () => {
    const { ctx, workspace } = probe();
    await act(async () => ctx().edit([{ type: "set_summary", text: "Mine" }]));
    const batch = ctx().latestBatch as number;
    vi.spyOn(workspace.store, "applyManual").mockResolvedValue({
      ok: false,
      plan: workspace.store.getPlan(),
      results: [],
      reason: CONFLICT_MESSAGE,
    });
    vi.spyOn(workspace.store, "undoDepth").mockReturnValue(0);
    await act(async () => ctx().edit([{ type: "set_summary", text: "Again" }]));
    expect(ctx().latestBatch).toBeNull();
    const undo = vi.spyOn(workspace.store, "undo");
    expect(await act(async () => ctx().undo(batch))).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    expect(within(toasts()).getByText(UNDO_STALE_MESSAGE)).toBeInTheDocument();
  });

  it("an AI card's Undo reports a failure and stays offered for a retry", async () => {
    const workspace = testWorkspace();
    const { user } = await aiCards(workspace);
    await user.click(screen.getByRole("button", { name: `Accept: ${DECOR}` }));
    vi.spyOn(workspace.store, "undo").mockResolvedValue({ ok: false, plan: workspace.store.getPlan(), results: [], reason: NETWORK });
    await user.click(await screen.findByRole("button", { name: `Undo: ${DECOR}` }));
    expect(await within(toasts()).findByText(NETWORK)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Undo: ${DECOR}` })).toBeEnabled();
  });
});
