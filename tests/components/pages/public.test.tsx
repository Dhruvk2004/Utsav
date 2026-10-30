import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SignInCard } from "@/components/auth/SignInCard";
import { HERO_DEMO_HREF } from "@/components/landing/HeroPreview";
import { Landing } from "@/components/landing/Landing";
import { PrivacyContent } from "@/components/privacy/PrivacyContent";
import type { SignInResult } from "@/lib/data/authClient";
import { PRIVACY_CONTACT } from "@/lib/site";
import { navigation, setUrl } from "../../helpers/navigation";
import { renderApp, testServices } from "../../helpers/render";

describe("Landing", () => {
  it("has one h1, the two hero actions and the decorative preview link", () => {
    renderApp(<Landing />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Plan the celebration, not the chaos.");
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", "/signin");
    expect(screen.getByRole("link", { name: "See a sample plan, no sign-in" })).toHaveAttribute("href", "/demo");
    const preview = screen.getByRole("link", { name: "Try this in the sample wedding" });
    expect(preview).toHaveAttribute("href", HERO_DEMO_HREF);
    expect(preview.querySelector("button")).toBeNull();
    expect(screen.getByRole("heading", { name: "How it works" })).toHaveAttribute("id", "how-it-works");
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(7);
  });
});

describe("PrivacyContent", () => {
  it("states P0 deletion by email while self-serve deletion does not exist", () => {
    renderApp(<PrivacyContent />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy and AI" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Delete your data" })).toHaveTextContent(
      `To delete your whole account, email ${PRIVACY_CONTACT}`,
    );
    expect(screen.getByRole("region", { name: "What we send to Gemini" })).toHaveAttribute("id", "gemini");
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("points to Settings once self-serve deletion ships", () => {
    renderApp(<PrivacyContent selfServeDeletion />);
    expect(screen.getByRole("region", { name: "Delete your data" })).toHaveTextContent("Delete your account in Settings.");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });
});

describe("SignInCard", () => {
  function renderCard(result: SignInResult | Promise<SignInResult>, configured = true) {
    const services = testServices();
    services.auth.signIn = vi.fn(() => Promise.resolve(result));
    services.auth.signInWithRedirect = vi.fn().mockResolvedValue(undefined);
    renderApp(<SignInCard configured={configured} />, { services });
    return services;
  }

  it("says plainly when sign-in is not configured", () => {
    renderCard({ ok: true, onboarded: true }, false);
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
    expect(screen.getByText("Sign-in isn't configured on this deployment.").closest("[role=status]")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See a sample plan" })).toHaveAttribute("href", "/demo");
  });

  it("sends a new user to onboarding and a returning user to next", async () => {
    renderCard({ ok: true, onboarded: false });
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/onboarding"));

    setUrl("/signin?next=/settings");
    renderCard({ ok: true, onboarded: true });
    await userEvent.click(screen.getAllByRole("button", { name: "Continue with Google" })[1]);
    await waitFor(() => expect(navigation.push).toHaveBeenLastCalledWith("/settings"));
  });

  it("shows a polite status while signing in", async () => {
    let finish: (r: SignInResult) => void = () => {};
    renderCard(new Promise<SignInResult>((resolve) => (finish = resolve)));
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(screen.getByText("Signing in…")).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toHaveAttribute("aria-busy", "true");
    finish({ ok: true, onboarded: true });
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/dashboard"));
  });

  it.each([
    ["cancelled", "Sign-in was cancelled."],
    ["network", "Couldn't reach Google."],
  ] as const)("shows the %s error with a retry", async (reason, title) => {
    const services = renderCard({ ok: false, reason });
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(title);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(services.auth.signIn).toHaveBeenCalledTimes(2);
  });

  it("offers to continue in this tab when the popup is blocked", async () => {
    const services = renderCard({ ok: false, reason: "popup_blocked" });
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByText("Your browser blocked the sign-in window.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue in this tab" }));
    expect(services.auth.signInWithRedirect).toHaveBeenCalled();
  });

  it("warms up sign-in and finishes a redirect sign-in when the page loads", async () => {
    const services = testServices();
    services.auth.preload = vi.fn();
    services.auth.completeRedirect = vi.fn().mockResolvedValue({ ok: true, onboarded: true });
    renderApp(<SignInCard configured />, { services });
    expect(services.auth.preload).toHaveBeenCalled();
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows why a redirect sign-in failed, and does nothing when sign-in is not configured", async () => {
    const services = testServices();
    services.auth.completeRedirect = vi.fn().mockResolvedValue({ ok: false, reason: "network" });
    renderApp(<SignInCard configured />, { services });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach Google.");

    const off = testServices();
    off.auth.completeRedirect = vi.fn();
    renderApp(<SignInCard configured={false} />, { services: off });
    expect(off.auth.completeRedirect).not.toHaveBeenCalled();
  });
});
