import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VendorsTab } from "@/components/workspace/tabs/VendorsTab";
import type { EnquiryDraft } from "@/lib/data/aiClient";
import type { EventDoc } from "@/lib/domain/model/event";
import { renderWorkspace, testWorkspace } from "../../helpers/workspace";

/**
 * Enquiry drafts in the vendor drawer (spec 6.6, T5): AI and template drafts, the filter notice,
 * email vs WhatsApp, saved drafts at the cap, viewing a saved draft and a failed save.
 */

const AI_DRAFT: EnquiryDraft = {
  subject: "Photography enquiry",
  body: "Hello [Vendor name], are you free?",
  origin: "ai",
  generatedDraftId: "gen-1",
  filtered: true,
};

function withDrafts(plan: EventDoc, count: number, origin: "ai" | "template" | "user" = "template"): EventDoc {
  return {
    ...plan,
    vendors: plan.vendors.map((v) =>
      v.category === "Photographer"
        ? {
            ...v,
            drafts: Array.from({ length: count }, (_, i) => ({
              id: `d${i}`,
              channel: "email" as const,
              language: "hi" as const,
              subject: `Saved ${i}`,
              body: `नमस्ते ${i}`,
              createdAt: "2026-10-20T06:00:00.000Z",
              origin,
            })),
          }
        : v,
    ),
  };
}

async function openPhotographer(workspace = testWorkspace("wedding", { ai: { enquiry: vi.fn(async () => AI_DRAFT) } })) {
  const user = userEvent.setup();
  renderWorkspace(<VendorsTab />, { workspace, tab: "vendors" });
  await user.click(screen.getByRole("button", { name: "Open Photographer" }));
  return { user, workspace, drawer: screen.getByRole("dialog", { name: "Photographer" }) };
}

describe("Enquiry draft", () => {
  it("an AI draft is marked AI, says what the filter removed, and email shows a subject", async () => {
    const { user, drawer, workspace } = await openPhotographer();
    await user.click(within(drawer).getByRole("radio", { name: "Email" }));
    await user.click(within(drawer).getByRole("radio", { name: "हिन्दी (Hindi)" }));
    await user.click(within(drawer).getByRole("radio", { name: "Formal" }));
    await user.click(within(drawer).getByRole("checkbox", { name: "Sign with my first name" }));
    await user.click(within(drawer).getByRole("button", { name: "Draft enquiry" }));
    expect(workspace.ai.enquiry).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ channel: "email", language: "hi", tone: "formal", signWithName: true }),
    );
    expect(
      await within(drawer).findByText("Some details were removed: Utsav never adds phone numbers, links or business names."),
    ).toBeInTheDocument();
    expect(within(drawer).getByLabelText("Subject")).toHaveValue("Photography enquiry");
    expect(within(drawer).getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "Open email" })).toHaveAttribute(
      "href",
      expect.stringContaining("subject=Photography%20enquiry"),
    );
    expect(within(drawer).getByLabelText(/^Message/)).toHaveAttribute("lang", "hi");
  });

  it("saving keeps the generated id so an unchanged AI draft stays `ai`", async () => {
    const { user, drawer, workspace } = await openPhotographer();
    const apply = vi.spyOn(workspace.store, "applyManual");
    await user.click(within(drawer).getByRole("button", { name: "Draft enquiry" }));
    await user.click(await within(drawer).findByRole("button", { name: "Save draft" }));
    expect(apply).toHaveBeenCalledWith([expect.objectContaining({ type: "save_draft", generatedDraftId: "gen-1" })]);
  });

  it("explains a failed save with the store's reason, or a fallback", async () => {
    const { user, drawer, workspace } = await openPhotographer();
    const apply = vi
      .spyOn(workspace.store, "applyManual")
      .mockResolvedValueOnce({ ok: false, plan: workspace.store.getPlan(), results: [], reason: "Too long" });
    await user.click(within(drawer).getByRole("button", { name: "Draft enquiry" }));
    await user.click(await within(drawer).findByRole("button", { name: "Save draft" }));
    expect(await within(drawer).findByRole("alert")).toHaveTextContent("Too long");
    apply.mockResolvedValueOnce({ ok: false, plan: workspace.store.getPlan(), results: [] });
    await user.click(within(drawer).getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(within(drawer).getByRole("alert")).toHaveTextContent("The draft could not be saved."));
  });

  it("at the cap of 3 saved drafts, Save is disabled with the reason; a saved draft can be viewed and deleted", async () => {
    const workspace = testWorkspace("wedding", { plan: (p) => withDrafts(p, 3), ai: { enquiry: vi.fn(async () => AI_DRAFT) } });
    const { user, drawer } = await openPhotographer(workspace);
    expect(within(drawer).getByRole("heading", { name: "Saved drafts (3)" })).toBeInTheDocument();
    expect(within(drawer).getAllByText(/· Template draft$/)).toHaveLength(3);
    await user.click(within(drawer).getAllByRole("button", { name: /^View/ })[1]);
    // Viewing restores the draft's own channel and language.
    expect(within(drawer).getByLabelText("Subject")).toHaveValue("Saved 1");
    expect(within(drawer).getByLabelText(/^Message/)).toHaveValue("नमस्ते 1");
    expect(within(drawer).getByRole("radio", { name: "हिन्दी (Hindi)" })).toBeChecked();
    expect(within(drawer).getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(within(drawer).getByText("Keep at most 3 drafts; delete one to save another.")).toBeInTheDocument();
    // Every saved draft has its own accessible name, even when saved the same day (QA-16 regression).
    const names = within(drawer)
      .getAllByRole("button", { name: /^(View|Delete) draft / })
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(new Set(names).size).toBe(6);
    expect(within(drawer).getByRole("button", { name: /^Delete draft 2, / })).toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: /^Delete draft 1, / }));
    await waitFor(() => expect(within(drawer).getByRole("heading", { name: "Saved drafts (2)" })).toBeInTheDocument());
  });

  it("a saved AI draft opens marked AI, and an empty body cannot be saved", async () => {
    const workspace = testWorkspace("wedding", { plan: (p) => withDrafts(p, 1, "ai") });
    const { user, drawer } = await openPhotographer(workspace);
    await user.click(within(drawer).getByRole("button", { name: /^View/ }));
    expect(within(drawer).queryByText("Template draft")).not.toBeInTheDocument();
    await user.clear(within(drawer).getByLabelText(/^Message/));
    expect(within(drawer).getByRole("button", { name: "Save draft" })).toBeDisabled();
  });

  it("copy puts the body on the clipboard and announces it", async () => {
    const { user, drawer } = await openPhotographer();
    // After userEvent.setup(), which installs its own clipboard.
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await user.click(within(drawer).getByRole("button", { name: "Draft enquiry" }));
    await user.click(await within(drawer).findByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(AI_DRAFT.body);
    await waitFor(() => expect(screen.getByTestId("announcer")).toHaveTextContent("Draft copied"));
  });
});
