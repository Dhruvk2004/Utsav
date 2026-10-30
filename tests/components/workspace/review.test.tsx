import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { EventWorkspace } from "@/components/workspace/EventWorkspace";
import { WorkspaceTabView } from "@/components/workspace/WorkspaceTabView";
import type { Services } from "@/lib/data/services";

import { setUrl } from "../../helpers/navigation";
import { renderApp, testServices } from "../../helpers/render";
import { stubEventSummaries } from "../../helpers/stubServices";

const stubServices = () => testServices({ summaries: stubEventSummaries("2026-10-28") });

/** `EventWorkspace` reads its params with `use()`: render it under Suspense, as the layout does, inside act. */
async function renderEvent(id: string, services: Services = stubServices(), children: ReactNode = <WorkspaceTabView />) {
  let result: ReturnType<typeof renderApp> | undefined;
  await act(async () => {
    result = renderApp(
      <Suspense fallback={null}>
        <EventWorkspace params={Promise.resolve({ id })}>{children}</EventWorkspace>
      </Suspense>,
      { services },
    );
  });
  return result as ReturnType<typeof renderApp>;
}

describe("Review your new plan (spec 6.2)", () => {
  it("marks sections reviewed, saves all ideas and resets a section through a card", async () => {
    const user = userEvent.setup();
    setUrl("/events/stub-birthday");
    await renderEvent("stub-birthday");
    const banner = await screen.findByRole("region", { name: "Review your new plan" });
    expect(within(banner).getByText("Reviewed")).toBeInTheDocument();
    await user.click(within(banner).getByRole("button", { name: "Looks good: Timeline" }));
    expect(await within(banner).findAllByText("Reviewed")).toHaveLength(2);
    await user.click(within(banner).getByRole("button", { name: "Save all" }));
    expect(await within(banner).findAllByText("Reviewed")).toHaveLength(3);

    await user.click(within(banner).getByRole("button", { name: "Reset section: Vendors" }));
    const card = await within(banner).findByRole("article", { name: "Reset Vendors to the starter template" });
    await waitFor(() => expect(within(card).getByRole("heading", { level: 4 })).toHaveFocus());
    await user.click(within(card).getByRole("button", { name: "Accept: Reset Vendors to the starter template" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Review your new plan" })).not.toBeInTheDocument());
  });

  it("dismisses the banner, reopens it from the event menu and starts from the template", async () => {
    const user = userEvent.setup();
    setUrl("/events/stub-birthday?ai=Add%20a%20painting%20station");
    await renderEvent("stub-birthday");
    const banner = await screen.findByRole("region", { name: "Review your new plan" });
    expect(screen.getByLabelText("Tell Utsav what to change")).toHaveValue("Add a painting station");
    await user.click(screen.getByRole("button", { name: "Close AI mode" }));

    await user.click(within(banner).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region", { name: "Review your new plan" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Event menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Review your new plan" }));
    const reopened = screen.getByRole("region", { name: "Review your new plan" });
    await user.click(within(reopened).getByRole("button", { name: "Start from the starter template instead" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Review your new plan" })).not.toBeInTheDocument());
  });
});

describe("EventWorkspace", () => {
  it("opens the event on its tab, and unknown events are not found", async () => {
    setUrl("/events/stub-wedding/vendors");
    const services = stubServices();
    const { unmount } = await renderEvent("stub-wedding", services);
    expect(await screen.findByRole("heading", { level: 1, name: "Ananya & Rohan's wedding" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vendors 10 active" })).toHaveAttribute("aria-current", "page");
    await userEvent.setup().click(screen.getByRole("button", { name: "Event menu" }));
    expect(screen.getByRole("menuitem", { name: "Event settings, share and calendar" })).toHaveAttribute(
      "href",
      "/events/stub-wedding/settings",
    );
    unmount();
    await renderEvent("nope", services, null);
    expect(await screen.findByRole("heading", { name: "We couldn't find that page." })).toBeInTheDocument();
  });

  it("reports a load error with a retry", async () => {
    setUrl("/events/x");
    const services = { ...stubServices(), workspaces: { open: async () => Promise.reject(new Error("down")) } };
    await renderEvent("x", services, null);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
