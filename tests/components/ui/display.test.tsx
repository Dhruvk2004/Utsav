import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Logo } from "@/components/brand/Logo";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { AiSurface, ChipGroup, ChipRadioGroup, ChoiceChip, OriginTag, Tag } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorSummary, summaryHeading } from "@/components/ui/ErrorSummary";
import { DiyaIcon, FlameIcon, GoogleIcon } from "@/components/ui/icons";
import { Toran } from "@/components/ui/Motifs";
import { ProgressBar, StagedProgress, StepIndicator } from "@/components/ui/Progress";
import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";
import { LinkTabs, SegmentedControl } from "@/components/ui/Tabs";

describe("chips", () => {
  it("ChoiceChip is a toggle button with a check when selected", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <ChoiceChip selected={false} onToggle={onToggle}>
        Tamil
      </ChoiceChip>,
    );
    const chip = screen.getByRole("button", { name: "Tamil" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(onToggle).toHaveBeenCalled();
    rerender(
      <ChoiceChip selected size="sm" onToggle={onToggle}>
        Tamil
      </ChoiceChip>,
    );
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("ChipGroup names the group and disables extra picks at the maximum", async () => {
    const onToggle = vi.fn();
    render(
      <ChipGroup
        id="t"
        legend="Traditions"
        hint="Choose up to 1."
        max={1}
        selected={["a"]}
        onToggle={onToggle}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
      />,
    );
    expect(screen.getByRole("group", { name: "Traditions" })).toHaveAccessibleDescription("Choose up to 1.");
    expect(screen.getByRole("button", { name: "B" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "A" }));
    expect(onToggle).toHaveBeenCalledWith("a");
  });

  it("ChipRadioGroup is a single choice", async () => {
    const onChange = vi.fn();
    render(
      <ChipRadioGroup
        name="b"
        legend="Budget comfort"
        value="balanced"
        onChange={onChange}
        options={[
          { value: "simple", label: "Keep it simple" },
          { value: "balanced", label: "Balanced" },
        ]}
      />,
    );
    expect(screen.getByRole("radio", { name: "Balanced" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Keep it simple" }));
    expect(onChange).toHaveBeenCalledWith("simple");
  });

  it("origin tags always write who made the item", () => {
    render(
      <>
        <OriginTag origin="ai" />
        <OriginTag origin="utsav" />
        <OriginTag origin="you" />
        <OriginTag origin="template" />
        <OriginTag origin="library" />
        <OriginTag origin="ai">2 suggestions waiting</OriginTag>
        <Tag tone="type">Wedding</Tag>
      </>,
    );
    for (const text of [
      "AI suggestion",
      "Suggested by Utsav",
      "Edited by you",
      "Starter template",
      "From Utsav's idea library",
      "2 suggestions waiting",
      "Wedding",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("AiSurface draws the Marigold edge for AI and the brand edge for Utsav", () => {
    render(
      <>
        <AiSurface aria-label="ai">x</AiSurface>
        <AiSurface origin="utsav" aria-label="code">
          y
        </AiSurface>
      </>,
    );
    expect(screen.getByRole("article", { name: "ai" })).toHaveClass("border-l-accent");
    expect(screen.getByRole("article", { name: "code" })).toHaveClass("border-l-brand");
  });
});

describe("feedback", () => {
  it("Alert uses role alert for errors and status otherwise", () => {
    render(
      <>
        <Alert tone="danger" title="Couldn't load." action={<button type="button">Retry</button>}>
          Try again.
        </Alert>
        <Alert tone="offline" title="Offline." />
        <Alert tone="warning" title="Careful." />
        <Alert tone="info" title="Info." icon={<svg />} />
        <Alert tone="neutral" title="Template." />
      </>,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(screen.getByText("Couldn't load.").closest("p")).toHaveTextContent("Couldn't load. Try again.");
  });

  it("ErrorSummary counts errors and moves focus to the field", async () => {
    render(
      <>
        <ErrorSummary errors={[{ id: "guests", label: "Guests", message: "Enter between 1 and 5,000 guests." }]} goal="save" />
        <input id="guests" aria-label="Guests" />
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Fix 1 thing to save");
    await userEvent.click(screen.getByRole("link", { name: "Guests: enter between 1 and 5,000 guests." }));
    expect(screen.getByLabelText("Guests")).toHaveFocus();
    expect(summaryHeading(3, "continue")).toBe("Fix 3 things to continue");
  });

  it("ErrorSummary renders nothing without errors", () => {
    const { container } = render(<ErrorSummary errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("EmptyState shows title, body, actions and extra content", () => {
    render(
      <EmptyState
        icon={<svg />}
        title="No events yet"
        body="Create your first plan."
        actions={<button type="button">Create an event</button>}
        headingLevel={3}
      >
        <p>Try: Wedding</p>
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "No events yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create an event" })).toBeInTheDocument();
    expect(screen.getByText("Try: Wedding")).toBeInTheDocument();
  });

  it("Skeletons are busy and described", () => {
    render(
      <SkeletonRegion label="Loading your events">
        <Skeleton className="w-1/2" />
      </SkeletonRegion>,
    );
    expect(screen.getByText("Loading your events").parentElement).toHaveAttribute("aria-busy", "true");
  });
});

describe("progress", () => {
  it("ProgressBar is named, clamped and has value text", () => {
    render(
      <>
        <ProgressBar label="Tasks done" value={12} max={34} valueText="12 of 34 tasks done" />
        <ProgressBar label="Empty" value={5} max={0} valueText="none" thin />
      </>,
    );
    const bar = screen.getByRole("progressbar", { name: "Tasks done" });
    expect(bar).toHaveAttribute("aria-valuetext", "12 of 34 tasks done");
    expect(screen.getByRole("progressbar", { name: "Empty" }).firstElementChild).toHaveStyle({ transform: "scaleX(0)" });
  });

  it("StepIndicator marks the current step and done steps", () => {
    render(<StepIndicator label="Steps" steps={["Basics", "Shape", "Who"]} current={1} showAllLabels={false} />);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).toHaveTextContent("Basics (done)");
  });

  it("StagedProgress announces every stage state", () => {
    render(
      <StagedProgress
        title="Building your plan"
        stages={[
          { label: "Reading", state: "done" },
          { label: "Drafting", state: "active" },
          { label: "Checking", state: "pending" },
          { label: "AI was unavailable.", state: "failed" },
        ]}
        note="Usually under 12 seconds."
        action={<button type="button">Cancel</button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Building your plan" })).toBeInTheDocument();
    expect(screen.getByText("Reading").textContent).toBe("Reading (done)");
    expect(screen.getByText("Drafting").textContent).toBe("Drafting (in progress)");
    expect(screen.getByText("Checking").textContent).toBe("Checking (waiting)");
    expect(screen.getByRole("list")).toHaveAttribute("aria-live", "polite");
  });
});

describe("tabs", () => {
  it("LinkTabs are links with aria-current and counts", () => {
    render(
      <LinkTabs
        label="Event lists"
        tabs={[
          { href: "/dashboard", label: "Upcoming", count: 3, current: true },
          { href: "/dashboard?view=past", label: "Vendors", count: 10, countLabel: "active", current: false },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Upcoming 3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Vendors 10 active" })).not.toHaveAttribute("aria-current");
  });

  it("SegmentedControl is a radiogroup", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        name="view"
        label="Budget view"
        value="category"
        onChange={onChange}
        options={[
          { value: "category", label: "By category" },
          { value: "function", label: "By function" },
        ]}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Budget view" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "By function" }));
    expect(onChange).toHaveBeenCalledWith("function");
  });
});

describe("brand", () => {
  it("Logo variants are images named Utsav", () => {
    render(
      <>
        <Logo />
        <Logo onHero />
        <Logo variant="mark" />
        <Logo variant="mono" />
      </>,
    );
    const logos = screen.getAllByRole("img", { name: "Utsav" });
    expect(logos).toHaveLength(4);
    expect(logos[1]).toHaveClass("text-hero-fg");
    expect(logos[3].querySelector("mask")?.id).toBeTruthy();
  });

  it("glyphs and motifs are hidden from assistive tech", () => {
    const { container } = render(
      <>
        <FlameIcon />
        <DiyaIcon size={16} />
        <GoogleIcon />
        <Toran />
        <Card flat>card</Card>
      </>,
    );
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
    expect(screen.getByText("card")).not.toHaveClass("shadow-1");
  });
});
