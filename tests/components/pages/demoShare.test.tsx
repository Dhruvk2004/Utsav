import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DemoChooser } from "@/components/demo/DemoChooser";
import { DEMO_SAMPLE_PARAMS, DemoSamplePage } from "@/components/demo/DemoSamplePage";
import { DemoWorkspace } from "@/components/demo/DemoWorkspace";
import { SharedHeader, SharedPlanView } from "@/components/share/SharedPlan";
import { SharedPlanPage } from "@/components/share/SharedPlanPage";
import { toSharedView } from "@/lib/client/shareView";
import { demoFixture } from "@/lib/demo/fixtures";
import { deriveView } from "@/lib/domain/view";
import { initialPrompt } from "@/components/workspace/EventWorkspace";
import type { SharedPlanResult } from "@/lib/server/loaders/share";
import { inProcessFetch } from "../../helpers/inProcessFetch";
import { setUrl } from "../../helpers/navigation";
import { renderApp } from "../../helpers/render";
import { testDeps } from "../../helpers/server";

describe("demo chooser", () => {
  it("lists the three samples with their first try", () => {
    render(<DemoChooser />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Open sample wedding" })).toHaveAttribute(
      "href",
      "/demo/wedding?tab=budget&ai=Cut%20decor%20spend%20by%2020%25",
    );
    expect(screen.getByRole("link", { name: "Open sample community event" })).toHaveAttribute("href", "/demo/community?tab=ideas");
    expect(DEMO_SAMPLE_PARAMS).toEqual([{ sample: "wedding" }, { sample: "birthday" }, { sample: "community" }]);
  });
});

describe("demo sample", () => {
  it("opens on the sample's default tab, read-only, and resets from the event menu", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", inProcessFetch(testDeps(), null));
    setUrl("/demo/birthday?ai=open");
    renderApp(<DemoWorkspace sample="birthday" />);
    expect(screen.getByRole("heading", { level: 1, name: "Sample 6th birthday" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Sample plan - not saved.");
    expect(screen.getByRole("link", { name: "Ideas" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Guests" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tell Utsav what to change")).toHaveValue("");
    await user.type(screen.getByLabelText("Tell Utsav what to change"), "Add a painting station");
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    await user.click(await screen.findByRole("button", { name: "Accept: Add task: Buy easels, washable paints and aprons" }));
    await user.click(screen.getByRole("button", { name: "Close AI mode" }));
    await user.click(screen.getByRole("button", { name: "Event menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Reset sample" }));
    await user.click(screen.getByRole("button", { name: /^Try AI mode/ }));
    expect(screen.queryByRole("heading", { name: /suggestions for/ })).not.toBeInTheDocument();
  }, 20_000);

  it("is a 404 for an unknown sample, and renders a known one", async () => {
    await expect(DemoSamplePage({ params: Promise.resolve({ sample: "party" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    const page = await DemoSamplePage({ params: Promise.resolve({ sample: "community" }) });
    setUrl("/demo/community");
    renderApp(page);
    expect(await screen.findByRole("heading", { level: 1, name: "Sample Diwali celebration" })).toBeInTheDocument();
  });

  it("reads ?ai=open as an empty box and any other value as the instruction", () => {
    expect(initialPrompt(null)).toBeUndefined();
    expect(initialPrompt("open")).toBe("");
    expect(initialPrompt("x".repeat(600))).toHaveLength(500);
  });
});

const shareResult = vi.hoisted(() => ({ value: { kind: "not_found" } as SharedPlanResult }));
vi.mock("@/lib/server/loaders/share", () => ({ loadSharedPlan: async () => shareResult.value }));

const sampleView = () => {
  const plan = demoFixture("wedding", "2026-10-28").event;
  return toSharedView(plan, deriveView(plan, "2026-10-28"), { showAmounts: true, showNotes: false, showTitle: false });
};

describe("shared plan (spec 10.15)", () => {
  it("renders the read-only plan and its header", () => {
    render(
      <>
        <SharedHeader />
        <SharedPlanView view={sampleView()} />
      </>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Wedding · Pune" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Make your own" })).toHaveAttribute("href", "/signin");
    const vendors = screen.getByRole("region", { name: "Budget lines" });
    expect(within(vendors).getByRole("rowheader", { name: "Photography" })).toBeInTheDocument();
    expect(screen.getByText("1 marked Not needed")).toBeInTheDocument();
    expect(screen.queryByText(/Bride/)).not.toBeInTheDocument();
  });

  it("renders the loaded view, is a 404 for a bad token and an error when rate limited", async () => {
    shareResult.value = { kind: "not_found" };
    await expect(SharedPlanPage({ params: Promise.resolve({ token: "demo" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    shareResult.value = { kind: "rate_limited" };
    await expect(SharedPlanPage({ params: Promise.resolve({ token: "a".repeat(43) }) })).rejects.toThrow(/Too many requests/);
    shareResult.value = { kind: "found", view: sampleView() };
    render(await SharedPlanPage({ params: Promise.resolve({ token: "a".repeat(43) }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Wedding · Pune" })).toBeInTheDocument();
  });
});
