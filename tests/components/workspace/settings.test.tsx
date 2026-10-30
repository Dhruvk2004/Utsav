import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EventSettings } from "@/components/workspace/EventSettings";
import { HOME_PATH } from "@/lib/client/navigation";
import { ApiRequestError } from "@/lib/data/api";
import type { EventControls } from "@/lib/data/workspaces";
import { navigation } from "../../helpers/navigation";
import { renderWorkspace, testWorkspace } from "../../helpers/workspace";

function controls(overrides: Partial<EventControls> = {}): EventControls {
  return {
    share: vi.fn(async () => "https://utsav.test/s/abc"),
    revokeShare: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    calendarHref: "/api/events/e1/calendar.ics",
    ...overrides,
  };
}

const renderSettings = (manage: EventControls | null = controls()) =>
  renderWorkspace(<EventSettings />, { workspace: testWorkspace("wedding", { manage }) });

describe("Event settings (spec 5.9)", () => {
  it("previews a date change, then saves only the changed details", async () => {
    const user = userEvent.setup();
    const { workspace } = renderSettings();
    const save = screen.getByRole("button", { name: "Save details" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2027-01-03" } });
    expect(document.getElementById("settings-date-preview")).toHaveTextContent(/^Moves the event 7 days later/);
    await user.click(save);
    await waitFor(() => expect(workspace.store.getPlan().details.eventDate).toBe("2027-01-03"));
    expect(workspace.store.getPlan().details.city).toBe(testWorkspace().store.getPlan().details.city);
  });

  it("shows field errors on save and keeps the plan unchanged", async () => {
    const user = userEvent.setup();
    const { workspace } = renderSettings();
    await user.clear(screen.getByLabelText("City"));
    await user.selectOptions(screen.getByLabelText("Language for AI text"), "hi");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("Add the city.")).toBeInTheDocument();
    expect(workspace.store.getPlan().details.language).toBe("en");
  });

  it("refuses a date the plan cannot move to, explaining why", () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2020-01-01" } });
    expect(document.getElementById("settings-date-preview")?.textContent).not.toMatch(/^Moves/);
    expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();
  });

  it("creates, copies and turns off the share link", async () => {
    const user = userEvent.setup();
    const manage = controls();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderSettings(manage);
    await user.click(screen.getByRole("switch", { name: "Show vendor notes" }));
    await user.click(screen.getByRole("button", { name: "Create link" }));
    expect(manage.share).toHaveBeenCalledWith({ showAmounts: expect.any(Boolean), showNotes: true });
    expect(await screen.findByLabelText("Link")).toHaveValue("https://utsav.test/s/abc");
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("https://utsav.test/s/abc");
    expect(screen.getByRole("button", { name: "Update link options" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn off link" }));
    await waitFor(() => expect(screen.queryByLabelText("Link")).not.toBeInTheDocument());
    expect(manage.revokeShare).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create link" })).toBeInTheDocument();
  });

  it("announces a new link and moves focus to it (CO-01 regression)", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await waitFor(() => expect(screen.getByLabelText("Link")).toHaveFocus());
    await waitFor(() => expect(screen.getByTestId("announcer")).toHaveTextContent("Link created. It is in the Link field."));
    await user.click(screen.getByRole("button", { name: "Update link options" }));
    await waitFor(() => expect(screen.getByTestId("announcer")).toHaveTextContent("Link updated."));
  });

  it("explains a failed share request", async () => {
    const user = userEvent.setup();
    renderSettings(controls({ share: vi.fn(async () => Promise.reject(new Error("offline"))) }));
    await user.click(screen.getByRole("button", { name: "Create link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't work");
  });

  it("offers the calendar file and deletes the event only after the title is typed", async () => {
    const user = userEvent.setup();
    const manage = controls();
    renderSettings(manage);
    expect(screen.getByRole("link", { name: "Download .ics" })).toHaveAttribute("href", "/api/events/e1/calendar.ics");
    await user.click(screen.getByRole("button", { name: "Delete event" }));
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Delete for good" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/^Type/), "Marathi-Punjabi wedding");
    await user.click(confirm);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(HOME_PATH));
    expect(manage.remove).toHaveBeenCalledWith("Marathi-Punjabi wedding");
  });

  it("shows the server's reason when deleting fails, and hides share and delete without controls", async () => {
    const user = userEvent.setup();
    const failure = new ApiRequestError(400, "invalid_input", "x", { error: { fields: { confirmTitle: "Type the event name exactly." } } });
    const { unmount } = renderSettings(controls({ remove: vi.fn(async () => Promise.reject(failure)) }));
    await user.click(screen.getByRole("button", { name: "Delete event" }));
    await user.type(screen.getByLabelText(/^Type/), "Marathi-Punjabi wedding");
    await user.click(screen.getByRole("button", { name: "Delete for good" }));
    expect(await screen.findByText("Type the event name exactly.")).toBeInTheDocument();
    unmount();

    renderSettings(null);
    expect(screen.getByRole("heading", { name: "Details" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Delete this event" })).not.toBeInTheDocument();
  });

  it("opens What-if from the budget section", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: "Change the total in What if?" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
