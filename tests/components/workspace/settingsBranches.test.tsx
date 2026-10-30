import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EventSettings } from "@/components/workspace/EventSettings";
import { ApiRequestError } from "@/lib/data/api";
import type { EventControls } from "@/lib/data/workspaces";
import { CONFLICT_MESSAGE } from "@/lib/plan/commands";
import { renderWorkspace, testWorkspace } from "../../helpers/workspace";

/** Event settings paths the main suite leaves out: failed saves, an already-shared plan, delete failures. */

function controls(overrides: Partial<EventControls> = {}): EventControls {
  return {
    share: vi.fn(async () => "https://utsav.test/s/abc"),
    revokeShare: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    calendarHref: "/x.ics",
    ...overrides,
  };
}

describe("Event settings: failures and existing links", () => {
  it("shows the store's reason when saving details fails, and a fallback without one", async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace("wedding", { manage: controls() });
    const apply = vi
      .spyOn(workspace.store, "applyManual")
      .mockResolvedValueOnce({ ok: false, plan: workspace.store.getPlan(), results: [], reason: CONFLICT_MESSAGE });
    renderWorkspace(<EventSettings />, { workspace });
    await user.clear(screen.getByLabelText("City"));
    await user.type(screen.getByLabelText("City"), "Nashik");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(CONFLICT_MESSAGE);

    apply.mockResolvedValueOnce({ ok: false, plan: workspace.store.getPlan(), results: [] });
    await user.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("The details could not be saved.")).toBeInTheDocument();
  });

  it("switching the AI language to Hindi and back leaves nothing to save", async () => {
    const user = userEvent.setup();
    renderWorkspace(<EventSettings />, { workspace: testWorkspace("wedding", { manage: controls() }) });
    const language = screen.getByLabelText("Language for AI text");
    await user.selectOptions(language, "hi");
    expect(screen.getByRole("button", { name: "Save details" })).toBeEnabled();
    await user.selectOptions(language, "en");
    expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();
  });

  it("an event that is already shared offers to show its link, keeping the stored options", async () => {
    const user = userEvent.setup();
    const manage = controls();
    const workspace = testWorkspace("wedding", {
      manage,
      plan: (p) => ({ ...p, share: { active: true, tokenHash: "h", showAmounts: true, showNotes: false } }),
    });
    renderWorkspace(<EventSettings />, { workspace });
    expect(screen.getByRole("switch", { name: "Show amounts" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Turn off link" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show the link" }));
    expect(manage.share).toHaveBeenCalledWith({ showAmounts: true, showNotes: false });
    expect(await screen.findByLabelText("Link")).toHaveValue("https://utsav.test/s/abc");
  });

  it("explains a failed turn-off and keeps the link active", async () => {
    const user = userEvent.setup();
    const manage = controls({ revokeShare: vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))) });
    renderWorkspace(<EventSettings />, {
      workspace: testWorkspace("wedding", {
        manage,
        plan: (p) => ({ ...p, share: { active: true, tokenHash: "h", showAmounts: false, showNotes: false } }),
      }),
    });
    await user.click(screen.getByRole("button", { name: "Turn off link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Check your connection");
    expect(screen.getByRole("button", { name: "Turn off link" })).toBeEnabled();
  });

  it("a delete that fails without a field message says to try again, and the dialog stays", async () => {
    const user = userEvent.setup();
    for (const failure of [new TypeError("Failed to fetch"), new ApiRequestError(500, "internal", "x", { error: { code: "internal" } })]) {
      const { unmount } = renderWorkspace(<EventSettings />, {
        workspace: testWorkspace("wedding", { manage: controls({ remove: vi.fn(async () => Promise.reject(failure)) }) }),
      });
      await user.click(screen.getByRole("button", { name: "Delete event" }));
      fireEvent.change(screen.getByLabelText(/^Type/), { target: { value: "Marathi-Punjabi wedding" } });
      await user.click(screen.getByRole("button", { name: "Delete for good" }));
      await waitFor(() => expect(screen.getByText("The event could not be deleted. Try again.")).toBeInTheDocument());
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      unmount();
    }
  });
});
