import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { SettingsPage } from "@/components/profile/SettingsPage";

import { todayInIndia } from "@/lib/domain/dates";
import { navigation, setUrl } from "../../helpers/navigation";
import { renderApp, testServices } from "../../helpers/render";
import { stubEventSummaries } from "../../helpers/stubServices";

const today = todayInIndia();

describe("Dashboard", () => {
  it("lists upcoming events as single-link cards, soonest first", async () => {
    renderApp(<Dashboard />, { services: testServices({ summaries: stubEventSummaries(today) }) });
    expect(screen.getByText("Loading your events").parentElement).toHaveAttribute("aria-busy", "true");
    const list = await screen.findByRole("list");
    const cards = within(list).getAllByRole("link");
    expect(cards.map((c) => c.getAttribute("href"))).toEqual(["/events/stub-birthday", "/events/stub-wedding", "/events/stub-anniversary"]);
    expect(within(cards[0]).getByRole("progressbar", { name: "Tasks done" })).toBeInTheDocument();
    expect(cards[0]).toHaveTextContent("1 overdue task");
    expect(cards[1]).toHaveTextContent("2 suggestions waiting");
    expect(cards[2]).toHaveTextContent("Starter template");
    expect(screen.getByRole("link", { name: "Upcoming 3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "New event" })).toHaveAttribute("href", "/events/new");
  });

  it("shows past events on the Past tab", async () => {
    setUrl("/dashboard?view=past");
    renderApp(<Dashboard />, { services: testServices({ summaries: stubEventSummaries(today) }) });
    const list = await screen.findByRole("list");
    expect(within(list).getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Past 1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Past events" })).toBeInTheDocument();
  });

  it("says when a tab is empty", async () => {
    setUrl("/dashboard?view=past");
    renderApp(<Dashboard />, { services: testServices({ summaries: stubEventSummaries(today).slice(0, 1) }) });
    expect(await screen.findByText("No past events yet.")).toBeInTheDocument();
    setUrl("/dashboard");
    renderApp(<Dashboard />, { services: testServices({ summaries: stubEventSummaries(today).slice(3) }) });
    expect(await screen.findByText("No upcoming events. Create one to start planning.")).toBeInTheDocument();
  });

  it("offers a first event with prefilled starting points when there are none", async () => {
    renderApp(<Dashboard />);
    expect(await screen.findByRole("heading", { name: "No events yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an event" })).toHaveAttribute("href", "/events/new");
    expect(screen.getByRole("link", { name: "Society Diwali" })).toHaveAttribute("href", "/events/new?type=community&occasion=diwali");
  });

  it("shows an error with Retry", async () => {
    const services = testServices();
    const list = vi.spyOn(services.events, "list").mockRejectedValueOnce(new Error("offline"));
    renderApp(<Dashboard />, { services });
    expect(await screen.findByText("Couldn't load your events.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "No events yet" })).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe("SettingsPage", () => {
  const onboarded = { homeCity: "Pune", traditions: ["marathi" as const], aiUsage: { day: today, count: 12 } };

  it("shows the account, saved defaults and today's AI usage", async () => {
    renderApp(<SettingsPage />, { services: testServices({ profile: onboarded }) });
    expect(screen.getByText("Loading your settings")).toBeInTheDocument();
    expect(await screen.findByText("ananya@example.com · from Google")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Home city" })).toHaveValue("Pune");
    expect(screen.getByRole("button", { name: "Marathi" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("12 of 60 suggestions")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run onboarding again" })).toHaveAttribute("href", "/onboarding?rerun=1");
  });

  it("saves changes, announces them and confirms with a toast", async () => {
    const services = testServices({ profile: onboarded });
    const save = vi.spyOn(services.profiles, "save");
    renderApp(<SettingsPage />, { services });
    await screen.findByText("ananya@example.com · from Google");
    await userEvent.selectOptions(screen.getByLabelText("I usually plan"), "community");
    await userEvent.selectOptions(screen.getByLabelText("Budget comfort"), "all_out");
    await userEvent.selectOptions(screen.getByLabelText("Show me"), "urgent");
    await userEvent.click(screen.getByRole("button", { name: "Birthday" }));
    await userEvent.click(within(screen.getByRole("group", { name: "Dietary" })).getByRole("button", { name: "Jain" }));
    await userEvent.click(screen.getByRole("radio", { name: "हिन्दी (Hindi)" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "community",
          budgetStyle: "all_out",
          detailLevel: "urgent",
          eventTypes: ["birthday"],
          dietary: ["jain"],
          language: "hi",
        }),
      ),
    );
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("announcer")).toHaveTextContent("Saved. New events will use these answers."));
    await userEvent.selectOptions(screen.getByLabelText("I usually plan"), "");
    await userEvent.selectOptions(screen.getByLabelText("Budget comfort"), "");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ role: null, budgetStyle: null })));
  });

  it("lists every problem in the summary and keeps values", async () => {
    renderApp(<SettingsPage />, { services: testServices({ profile: onboarded }) });
    await screen.findByText("ananya@example.com · from Google");
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.clear(screen.getByRole("combobox", { name: "Home city" }));
    await userEvent.click(screen.getByRole("button", { name: "Mixed/other" }));
    const other = screen.getByLabelText("Mixed/other: tell us in a few words");
    other.removeAttribute("maxlength");
    await userEvent.type(other, "x".repeat(61));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent("Fix 3 things to save your profile");
    await waitFor(() => expect(summary).toHaveFocus());
    await userEvent.click(within(summary).getByRole("link", { name: /Traditions, Mixed\/other/ }));
    expect(other).toHaveFocus();
  });

  it("reports a failed save and signs out", async () => {
    const services = testServices({ profile: onboarded });
    vi.spyOn(services.profiles, "save").mockRejectedValueOnce(new Error("offline"));
    renderApp(<SettingsPage />, { services });
    await screen.findByText("ananya@example.com · from Google");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Couldn't save your profile.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/"));
  });

  it("retries a failed load", async () => {
    const services = testServices();
    vi.spyOn(services.profiles, "load").mockRejectedValueOnce(new Error("offline"));
    renderApp(<SettingsPage />, { services });
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Your profile" })).toBeInTheDocument();
  });
});
