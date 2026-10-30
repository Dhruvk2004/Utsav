import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GeneratingPanel } from "@/components/events/GeneratingPanel";
import { NewEventWizard } from "@/components/events/NewEventWizard";
import { newWizardForm } from "@/lib/client/eventWizard";
import { ApiRequestError } from "@/lib/data/api";
import { isAbortError } from "@/lib/data/wait";
import { addDays, todayInIndia } from "@/lib/domain/dates";
import { navigation, setUrl } from "../../helpers/navigation";
import { renderApp, testServices } from "../../helpers/render";

const today = todayInIndia();
const stepHeading = () => screen.getByRole("heading", { level: 2, name: /^Step \d of 3/ });

async function open(
  url = "/events/new",
  services = testServices({ profile: { homeCity: "Pune", traditions: ["marathi"], dietary: ["veg"] } }),
) {
  setUrl(url);
  const result = renderApp(<NewEventWizard />, { services });
  await screen.findByRole("heading", { name: "Step 1 of 3: Basics" });
  return result;
}

function fillBasics(date = addDays(today, 47)) {
  fireEvent.change(screen.getByLabelText("Event date"), { target: { value: date } });
  fireEvent.change(screen.getByLabelText("Guests"), { target: { value: "350" } });
  fireEvent.change(screen.getByLabelText("Total budget"), { target: { value: "2500000" } });
}

describe("NewEventWizard, step 1", () => {
  it("starts from the profile and shows live helpers", async () => {
    await open();
    expect(screen.getByRole("radio", { name: "Wedding" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "City" })).toHaveValue("Pune");
    expect(screen.getByLabelText("Title (optional)")).toHaveAttribute("placeholder", "Wedding");
    fillBasics();
    expect(screen.getByLabelText("Total budget")).toHaveValue("25,00,000");
    expect(screen.getByLabelText("Total budget")).toHaveAccessibleDescription("About ₹7,142 per guest");
    expect(screen.getByLabelText("Event date")).toHaveAccessibleDescription(/· 47 days from today$/);
    expect(screen.getByRole("list", { name: "New event steps" })).toBeInTheDocument();
  });

  it("shows the error summary on Next and keeps values", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Guests"), { target: { value: "0" } });
    await userEvent.click(screen.getByRole("button", { name: "Next: Shape" }));
    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent("Fix 3 things to continue");
    expect(within(summary).getByRole("link", { name: "Guests: enter between 1 and 5,000 guests." })).toBeInTheDocument();
    await waitFor(() => expect(summary).toHaveFocus());
    expect(screen.getByLabelText("Guests")).toHaveValue(0);
    expect(navigation.push).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Event date"), { target: { value: addDays(today, -3) } });
    expect(screen.getByLabelText("Event date")).toHaveAccessibleDescription(/Pick a date from today/);
  });

  it("switches the conditional fields by type", async () => {
    await open("/events/new?type=birthday");
    expect(screen.getByRole("radio", { name: "Birthday" })).toBeChecked();
    fireEvent.change(screen.getByLabelText("Turning (age) (optional)"), { target: { value: "6" } });
    expect(screen.getByLabelText("Title (optional)")).toHaveAttribute("placeholder", "6th birthday");
    await userEvent.click(screen.getByRole("radio", { name: "Anniversary" }));
    expect(screen.getByLabelText("Years married (optional)")).toHaveValue(null);
    await userEvent.click(screen.getByRole("radio", { name: "Other" }));
    await userEvent.selectOptions(screen.getByLabelText("Occasion (optional)"), "other");
    await userEvent.type(screen.getByLabelText("Tell us the occasion"), "Foundation day");
    expect(screen.getByLabelText("Title (optional)")).toHaveAttribute("placeholder", "Foundation day");
  });

  it("notes the festival next to a community date", async () => {
    await open("/events/new?type=community&occasion=diwali");
    expect(screen.getByLabelText("Occasion (optional)")).toHaveValue("diwali");
    fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2026-11-06" } });
    expect(screen.getByText("Diwali is on Sun 8 Nov 2026, 2 days after your date.")).toBeInTheDocument();
  });
});

async function toStep2(url?: string) {
  const result = await open(url);
  fillBasics();
  await userEvent.click(screen.getByRole("button", { name: "Next: Shape" }));
  await waitFor(() => expect(stepHeading()).toHaveTextContent("Step 2 of 3: Shape"));
  return result;
}

describe("NewEventWizard, steps 2 and 3", () => {
  it("lists the wedding functions with unique names, adds and removes rows", async () => {
    await toStep2();
    expect(navigation.push).toHaveBeenCalledWith("/events/new?step=2", { scroll: false });
    expect(stepHeading()).toHaveFocus();
    expect(screen.getByLabelText("Name, function 1")).toHaveValue("Haldi");
    await userEvent.click(screen.getByRole("button", { name: "Remove Haldi" }));
    expect(screen.getByLabelText("Name, function 1")).toHaveValue("Mehndi");
    for (let i = 0; i < 4; i++) await userEvent.click(screen.getByRole("button", { name: "Add function" }));
    expect(screen.getByRole("button", { name: "Add function" })).toBeDisabled();
    expect(screen.getByText("Up to 8 functions.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next: Who it's for" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Function 5 name: add a name.");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(stepHeading()).toHaveTextContent("Step 1 of 3"));
    expect(screen.getByLabelText("Guests")).toHaveValue(350);
  });

  it("asks a community event whether it has parts and checks times and shares", async () => {
    await toStep2("/events/new?type=community&occasion=diwali");
    const toggle = screen.getByRole("switch", { name: "Does this event have several parts?" });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(screen.getByRole("heading", { name: "Parts" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Name, part 1"), "Lakshmi puja");
    await userEvent.type(screen.getByLabelText("Name, part 2"), "Dinner");
    fireEvent.change(screen.getByLabelText("Start, part 2 (optional)"), { target: { value: "19:00" } });
    fireEvent.change(screen.getByLabelText("End, part 2 (optional)"), { target: { value: "18:30" } });
    fireEvent.change(screen.getByLabelText("Share %, part 1 (optional)"), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText("Share %, part 2 (optional)"), { target: { value: "40" } });
    await userEvent.click(screen.getByRole("button", { name: "Next: Who it's for" }));
    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent("Dinner end time: end time must be after the start time.");
    expect(summary).toHaveTextContent("Shares: shares add up to more than 100%.");
    // The summary takes focus on the next frame; wait for it, or a slow frame steals focus back from the link's target.
    await waitFor(() => expect(summary).toHaveFocus());
    await userEvent.click(within(summary).getByRole("link", { name: /Shares/ }));
    expect(document.getElementById("event-functions")).toHaveFocus();
    await userEvent.click(toggle);
    await userEvent.type(screen.getByLabelText("Vibe (optional)"), "Bright");
    await userEvent.click(screen.getByRole("button", { name: "Next: Who it's for" }));
    await waitFor(() => expect(stepHeading()).toHaveTextContent("Step 3 of 3"));
  });

  it("collects people and interests, then creates the plan and opens it", async () => {
    const { services } = await toStep2();
    const create = vi.spyOn(services.events, "create");
    await userEvent.click(screen.getByRole("button", { name: "Next: Who it's for" }));
    await waitFor(() => expect(stepHeading()).toHaveTextContent("Step 3 of 3"));
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    await userEvent.selectOptions(screen.getByLabelText("Role, person 1"), "bride");
    await userEvent.type(screen.getByLabelText("Name, person 1 (optional)"), "Ananya");
    fireEvent.change(screen.getByLabelText("Age, person 1 (optional)"), { target: { value: "28" } });
    await userEvent.selectOptions(screen.getByLabelText("Gender, person 1 (optional)"), "female");
    const interests = screen.getByLabelText(/^Interests, person 1/);
    await userEvent.type(interests, "Kathak{Enter}");
    await userEvent.type(interests, "Travel");
    await userEvent.click(screen.getByRole("button", { name: "Add interest, person 1" }));
    await userEvent.type(interests, "Kathak{Enter}");
    expect(within(screen.getByRole("list", { name: "Interests added, person 1" })).getAllByRole("listitem")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Remove Travel" }));
    await userEvent.type(screen.getByLabelText("Notes, person 1 (optional)"), "Arrives early");
    await userEvent.click(screen.getByRole("checkbox", { name: "Elderly guests" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Young kids" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Guests with mobility needs" }));
    await userEvent.type(screen.getByLabelText("Theme (optional)"), "Pastel");
    await userEvent.click(screen.getByRole("radio", { name: "हिन्दी (Hindi)" }));
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove person 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Create my plan" }));

    await waitFor(() => expect(navigation.push).toHaveBeenLastCalledWith("/events/new-event-1"));
    const request = create.mock.calls[0][0];
    expect(request).toMatchObject({
      mode: "ai",
      eventType: "wedding",
      city: "Pune",
      guestCount: 350,
      budget: 2_500_000,
      theme: "Pastel",
      language: "hi",
    });
    expect(request.honorees).toEqual([
      { role: "bride", name: "Ananya", age: 28, gender: "female", interests: ["Kathak"], notes: "Arrives early" },
    ]);
    expect(request.flags).toEqual({ kids: true, elderly: true, mobility: true });
  });

  it("sends the user back to the first step with problems when creating", async () => {
    await toStep2();
    await userEvent.click(screen.getByRole("button", { name: "Next: Who it's for" }));
    await waitFor(() => expect(stepHeading()).toHaveTextContent("Step 3 of 3"));
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    fireEvent.change(screen.getByLabelText("Age, person 1 (optional)"), { target: { value: "200" } });
    await userEvent.click(screen.getByRole("button", { name: "Create a blank plan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Person 1 age: enter an age from 0 to 120.");
    fireEvent.change(screen.getByLabelText("Age, person 1 (optional)"), { target: { value: "" } });
    navigation.back();
    navigation.back();
    fireEvent.click(screen.getByRole("button", { name: "Create a blank plan" }));
    expect(screen.getByRole("heading", { name: "Building your plan" })).toBeInTheDocument();
  });

  it("passes every edited field into the request", async () => {
    const { services } = await open();
    const create = vi.spyOn(services.events, "create");
    await userEvent.type(screen.getByLabelText("Title (optional)"), "Ananya & Rohan");
    await userEvent.clear(screen.getByRole("combobox", { name: "City" }));
    await userEvent.type(screen.getByRole("combobox", { name: "City" }), "Nashik");
    fillBasics();
    await userEvent.click(screen.getByRole("button", { name: "Next: Shape" }));
    await waitFor(() => expect(stepHeading()).toHaveTextContent("Step 2"));
    fireEvent.change(screen.getByLabelText("Date, function 4 (optional)"), { target: { value: addDays(today, 47) } });
    await userEvent.click(screen.getByRole("button", { name: "Mixed/other" }));
    await userEvent.type(screen.getByLabelText("Mixed/other: tell us in a few words"), "Konkani");
    await userEvent.click(within(screen.getByRole("group", { name: "Dietary" })).getByRole("button", { name: "Jain" }));
    await userEvent.click(screen.getByRole("button", { name: "Next: Who it's for" }));
    await waitFor(() => expect(stepHeading()).toHaveTextContent("Step 3"));
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    const interests = screen.getByLabelText(/^Interests, person 1/);
    for (let i = 1; i <= 8; i++) await userEvent.type(interests, `Interest ${i}{Enter}`);
    expect(interests).toBeDisabled();
    expect(interests).toHaveAttribute("placeholder", "Limit reached");
    await userEvent.click(screen.getByRole("button", { name: "Create my plan" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({
      title: "Ananya & Rohan",
      city: "Nashik",
      tradition: ["marathi", "mixed_other"],
      traditionOther: "Konkani",
      dietary: ["veg", "jain"],
    });
    expect(create.mock.calls[0][0].functions[3].date).toBe(addDays(today, 47));
    expect(create.mock.calls[0][0].honorees[0].interests).toHaveLength(8);
  });

  it("returns to an unreached step's furthest point when the URL skips ahead", async () => {
    await open("/events/new?step=3");
    expect(stepHeading()).toHaveTextContent("Step 1 of 3");
  });
});

describe("generating", () => {
  async function toGenerating(services = testServices({ profile: { homeCity: "Pune" } })) {
    await open("/events/new", services);
    fillBasics();
    await userEvent.click(screen.getByRole("button", { name: "Next: Shape" }));
    await waitFor(() => expect(stepHeading()).toHaveTextContent("Step 2"));
    await userEvent.click(screen.getByRole("button", { name: "Next: Who it's for" }));
    await waitFor(() => expect(stepHeading()).toHaveTextContent("Step 3"));
    await userEvent.click(screen.getByRole("button", { name: "Create my plan" }));
  }

  it("shows the template fallback stage before opening the plan", async () => {
    const services = testServices({ profile: { homeCity: "Pune" } });
    vi.spyOn(services.events, "create").mockResolvedValue({ eventId: "e1", source: "template" });
    await toGenerating(services);
    expect(await screen.findByText("AI was unavailable. Using the starter template.")).toBeInTheDocument();
    await waitFor(() => expect(navigation.push).toHaveBeenLastCalledWith("/events/e1"), { timeout: 3_000 });
  });

  it("sends one create request even when Strict Mode runs the effect twice (QA-11 regression)", async () => {
    const services = testServices({ profile: { homeCity: "Pune" } });
    const create = vi.spyOn(services.events, "create").mockResolvedValue({ eventId: "e1", source: "ai" });
    const form = { ...newWizardForm(null), eventDate: addDays(today, 47), city: "Pune", guests: "350", budget: "25,00,000" };
    const { unmount } = renderApp(<GeneratingPanel form={form} mode="ai" onCancelled={() => undefined} />, {
      services,
      reactStrictMode: true,
    });
    await waitFor(() => expect(navigation.push).toHaveBeenLastCalledWith("/events/e1"));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]?.aborted).toBe(false);
    unmount();
  });

  it("aborts the request when the panel goes away for good", async () => {
    const services = testServices({ profile: { homeCity: "Pune" } });
    let signal: AbortSignal | undefined;
    vi.spyOn(services.events, "create").mockImplementation((_, s) => {
      signal = s;
      return new Promise(() => undefined);
    });
    const form = { ...newWizardForm(null), eventDate: addDays(today, 47), city: "Pune", guests: "350", budget: "25,00,000" };
    const { unmount } = renderApp(<GeneratingPanel form={form} mode="ai" onCancelled={() => undefined} />, {
      services,
      reactStrictMode: true,
    });
    unmount();
    await waitFor(() => expect(signal?.aborted).toBe(true));
  });

  it("can be cancelled, keeping the answers", async () => {
    const services = testServices({ profile: { homeCity: "Pune" } });
    let signal: AbortSignal | undefined;
    vi.spyOn(services.events, "create").mockImplementation((_, s) => {
      signal = s;
      return new Promise((_resolve, reject) => s?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    });
    await toGenerating(services);
    expect(screen.getByText("Drafting budget, timeline, vendors and ideas").textContent).toContain("(in progress)");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signal?.aborted).toBe(true);
    expect(screen.getByText("Plan creation cancelled. Your answers are still here.")).toBeInTheDocument();
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
  });

  it("offers Try again and Edit answers when creation fails", async () => {
    const services = testServices({ profile: { homeCity: "Pune" } });
    const create = vi.spyOn(services.events, "create").mockRejectedValueOnce(new Error("offline"));
    await toGenerating(services);
    expect(await screen.findByText("Couldn't create your plan.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(navigation.push).toHaveBeenLastCalledWith("/events/new-event-1"));
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("shows the server's reason when it refuses the create (the event limit, SEC-12), and the retry hint otherwise", async () => {
    const services = testServices({ profile: { homeCity: "Pune" } });
    const limit = new ApiRequestError(
      409,
      "event_limit",
      "You can keep up to 100 events. Delete one you no longer need to create another.",
      {},
    );
    vi.spyOn(services.events, "create")
      .mockRejectedValueOnce(limit)
      .mockRejectedValueOnce(new ApiRequestError(500, "http_error", "Internal", {}));
    await toGenerating(services);
    expect(await screen.findByText(/You can keep up to 100 events/)).toBeInTheDocument();
    expect(screen.getByText(/Your answers are still here/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Your answers are still here. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.queryByText(/Internal/)).toBeNull();
  });

  it("returns to the form from the failure", async () => {
    const services = testServices({ profile: { homeCity: "Pune" } });
    vi.spyOn(services.events, "create").mockRejectedValue(new Error("offline"));
    await toGenerating(services);
    await userEvent.click(await screen.findByRole("button", { name: "Edit answers" }));
    expect(stepHeading()).toHaveTextContent("Step 3 of 3");
  });

  it("still starts when the profile cannot be loaded", async () => {
    const services = testServices();
    vi.spyOn(services.profiles, "load").mockRejectedValue(new Error("offline"));
    await open("/events/new", services);
    expect(screen.getByRole("combobox", { name: "City" })).toHaveValue("");
  });
});
