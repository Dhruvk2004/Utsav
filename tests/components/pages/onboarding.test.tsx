import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { profileSummary } from "@/components/onboarding/OnboardingDone";

import { navigation, setUrl } from "../../helpers/navigation";
import { renderApp, testServices } from "../../helpers/render";
import { STUB_PROFILE } from "../../helpers/stubServices";

const heading = () => screen.getByRole("heading", { level: 1 });

async function start(services = testServices()) {
  const result = renderApp(<OnboardingWizard />, { services });
  await screen.findByRole("heading", { name: "Welcome, Ananya. Let's set you up." });
  return result;
}

describe("OnboardingWizard", () => {
  it("asks for name and city first, with an error summary that stays in sync", async () => {
    await start();
    expect(screen.getByRole("progressbar", { name: "Onboarding progress" })).toHaveAttribute("aria-valuetext", "Step 1 of 4");
    expect(screen.getByLabelText("Your name")).toHaveValue("Ananya Kulkarni");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("Fix 1 thing to continue");
    await waitFor(() => expect(summary).toHaveFocus());
    const city = screen.getByRole("combobox", { name: "Home city" });
    expect(city).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(city, "Pune");
    expect(city).not.toHaveAttribute("aria-invalid");
    await userEvent.clear(screen.getByLabelText("Your name"));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Your name: enter your name.");
  });

  it("saves each step, moves focus to the new question and keeps answers on Back", async () => {
    const services = testServices();
    const save = vi.spyOn(services.profiles, "save");
    await start(services);
    await userEvent.type(screen.getByRole("combobox", { name: "Home city" }), "Pune");
    await userEvent.click(screen.getByRole("radio", { name: "हिन्दी (Hindi)" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(heading()).toHaveTextContent("What do you usually plan?"));
    expect(heading()).toHaveFocus();
    expect(save).toHaveBeenLastCalledWith({ displayName: "Ananya Kulkarni", homeCity: "Pune", language: "hi" });

    await userEvent.click(screen.getByRole("radio", { name: "Community or society events" }));
    await userEvent.click(screen.getByRole("button", { name: "Wedding" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("combobox", { name: "Home city" })).toHaveValue("Pune");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "What do you usually plan?" });
    expect(screen.getByRole("radio", { name: "Community or society events" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith({ role: "community", eventTypes: ["wedding"] }));

    await screen.findByRole("heading", { name: /Traditions and food/ });
    await userEvent.click(screen.getByRole("button", { name: "Marathi" }));
    await userEvent.click(screen.getByRole("button", { name: "Mixed/other" }));
    const other = screen.getByLabelText("Mixed/other: tell us in a few words");
    await userEvent.type(other, "Konkani side");
    await userEvent.click(screen.getByRole("button", { name: "Vegetarian" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith({ traditions: ["marathi", "mixed_other"], traditionOther: "Konkani side", dietary: ["veg"] }),
    );

    await screen.findByRole("heading", { name: "How do you like to plan?" });
    await userEvent.click(screen.getByRole("radio", { name: "Balanced" }));
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    await screen.findByRole("heading", { name: "You're set, Ananya." });
    expect(save).toHaveBeenLastCalledWith({ budgetStyle: "balanced", detailLevel: "everything", markOnboarded: true });
    expect(screen.getByText("Marathi, Konkani side")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create your first event" })).toHaveAttribute("href", "/events/new");
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute("href", "/dashboard");
    await userEvent.click(screen.getByRole("button", { name: "Edit answers" }));
    expect(screen.getByRole("heading", { name: /Welcome, Ananya/ })).toBeInTheDocument();
  });

  it("keeps the step in the URL, so the browser's Back returns to the previous step (BP-06 regression)", async () => {
    await start();
    await userEvent.type(screen.getByRole("combobox", { name: "Home city" }), "Pune");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(heading()).toHaveTextContent("What do you usually plan?"));
    expect(window.history.pushState).toHaveBeenLastCalledWith(null, "", "/onboarding?step=2");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: /Traditions and food/ });
    expect(window.history.pushState).toHaveBeenLastCalledWith(null, "", "/onboarding?step=3");
    // The page's Back is the browser's Back: one history entry, to step 2, not out of onboarding.
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigation.back).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(heading()).toHaveTextContent("What do you usually plan?"));
    expect(heading()).toHaveFocus();
  });

  it("shows the furthest step reached for a bookmarked later step, and keeps ?rerun", async () => {
    setUrl("/onboarding?rerun=1&step=4");
    renderApp(<OnboardingWizard />, { services: testServices() });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/Welcome/);
    expect(screen.getByRole("progressbar", { name: "Onboarding progress" })).toHaveAttribute("aria-valuetext", "Step 1 of 4");
    await userEvent.type(screen.getByRole("combobox", { name: "Home city" }), "Pune");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(window.history.pushState).toHaveBeenLastCalledWith(null, "", "/onboarding?rerun=1&step=2"));
  });

  it("skips optional steps, blocks an over-long Mixed/other answer and marks onboarding done on the last skip", async () => {
    const services = testServices({ profile: { homeCity: "Pune" } });
    const save = vi.spyOn(services.profiles, "save");
    await start(services);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "What do you usually plan?" });
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await screen.findByRole("heading", { name: /Traditions and food/ });
    await userEvent.click(screen.getByRole("button", { name: "Mixed/other" }));
    const other = screen.getByLabelText("Mixed/other: tell us in a few words");
    other.removeAttribute("maxlength");
    await userEvent.type(other, "x".repeat(61));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(other).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await screen.findByRole("heading", { name: "How do you like to plan?" });
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await screen.findByRole("heading", { name: "You're set, Ananya." });
    expect(save).toHaveBeenLastCalledWith({ markOnboarded: true });
  });

  it("keeps answers and offers Retry when a step fails to save", async () => {
    const services = testServices({ profile: { homeCity: "Pune" } });
    const save = vi.spyOn(services.profiles, "save").mockRejectedValueOnce(new Error("offline"));
    await start(services);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Couldn't save this step.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Home city" })).toHaveValue("Pune");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "What do you usually plan?" });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("re-runs from Settings with saved answers and returns there", async () => {
    setUrl("/onboarding?rerun=1");
    await start(testServices({ profile: { homeCity: "Pune", onboardedAt: "2026-10-01T00:00:00.000Z" } }));
    expect(screen.getByText("Updating your profile")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel and return to Settings" })).toHaveAttribute("href", "/settings");
    for (let i = 0; i < 3; i++) {
      await userEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => expect(heading()).not.toHaveTextContent(/Welcome/));
    }
    await screen.findByRole("heading", { name: "How do you like to plan?" });
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    await screen.findByRole("heading", { name: "Profile updated." });
    expect(screen.getByRole("link", { name: "Back to Settings" })).toHaveAttribute("href", "/settings");
  });

  it("greets without a name and retries a failed load", async () => {
    const services = testServices({ profile: { displayName: "" } });
    const load = vi.spyOn(services.profiles, "load").mockRejectedValueOnce(new Error("offline"));
    renderApp(<OnboardingWizard />, { services });
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Welcome. Let's set you up." })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("profileSummary", () => {
  it("writes unanswered questions as Not set", () => {
    expect(profileSummary(STUB_PROFILE)).toEqual([
      { label: "City", value: "Not set" },
      { label: "Language", value: "English" },
      { label: "Traditions", value: "Not set" },
      { label: "Food", value: "Not set" },
      { label: "Budget comfort", value: "Not set" },
    ]);
    expect(profileSummary({ ...STUB_PROFILE, traditions: ["mixed_other"], traditionOther: "" })[2].value).toBe("Mixed/other");
  });
});
