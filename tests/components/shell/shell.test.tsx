import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ServicesProvider, useServices } from "@/components/data/ServicesProvider";
import { useAsync } from "@/components/data/useAsync";
import { useToday } from "@/components/data/useToday";
import { AccountMenu, AppHeader } from "@/components/shell/AppHeader";
import { Avatar, initials } from "@/components/shell/Avatar";
import { Main, PageColumn } from "@/components/shell/Main";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { SkipLink } from "@/components/shell/SkipLink";
import { ErrorPanel, errorReference } from "@/components/system/ErrorPanel";
import { NotFound } from "@/components/system/NotFound";
import { todayInIndia } from "@/lib/domain/dates";
import { navigation, setUrl } from "../../helpers/navigation";
import { renderApp, testServices } from "../../helpers/render";

describe("chrome", () => {
  it("skip link targets the main landmark", () => {
    render(
      <>
        <SkipLink />
        <Main>
          <PageColumn narrow>content</PageColumn>
        </Main>
      </>,
    );
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });

  it("signed-out header offers how it works, the sample plan and sign in", () => {
    render(<SiteHeader onHero />);
    expect(screen.getByRole("link", { name: "Utsav" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/#how-it-works");
    expect(screen.getByRole("link", { name: "See a sample plan" })).toHaveAttribute("href", "/demo");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
  });

  it("minimal header shows only the logo", () => {
    render(<SiteHeader minimal />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("footer carries the trust statement and the same help links everywhere", () => {
    render(<SiteFooter />);
    expect(screen.getByText("AI suggests. Utsav checks the numbers. You decide.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How Utsav uses AI" })).toHaveAttribute("href", "/privacy#gemini");
  });

  it("404 and error panels give one way forward", async () => {
    const onRetry = vi.fn();
    render(
      <>
        <NotFound />
        <ErrorPanel reference="7f3a" onRetry={onRetry} />
      </>,
    );
    expect(screen.getByRole("heading", { name: "We couldn't find that page." })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Go to my events" })[0]).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText("Error ref: 7f3a")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows only a short digest as the error reference", () => {
    expect(errorReference(Object.assign(new Error("boom"), { digest: "7f3a9b21c0ffee" }))).toBe("7f3a9b21");
    expect(errorReference(new Error("boom"))).toBeUndefined();
    expect(errorReference("boom")).toBeUndefined();
  });
});

describe("AppHeader", () => {
  it("marks My events current on event pages and opens the account menu", async () => {
    setUrl("/events/new");
    const signOut = vi.fn().mockResolvedValue(undefined);
    const services = testServices();
    services.auth.signOut = signOut;
    renderApp(<AppHeader />, { services });
    expect(screen.getByRole("link", { name: "My events" })).toHaveAttribute("aria-current", "page");
    const trigger = await screen.findByRole("button", { name: "Ananya, account menu" });
    await userEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "Account menu" })).toHaveTextContent("ananya@example.com");
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/"));
  });

  it("leaves My events unmarked elsewhere and hides the menu if the profile fails", async () => {
    setUrl("/settings");
    const services = testServices();
    services.profiles.load = () => Promise.reject(new Error("offline"));
    const { container } = renderApp(<AccountMenu />, { services });
    await waitFor(() => expect(container.querySelector(".skeleton")).toBeNull());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    renderApp(<AppHeader />);
    expect(screen.getAllByRole("link", { name: "My events" })[0]).not.toHaveAttribute("aria-current");
  });
});

describe("Avatar", () => {
  it("shows initials, or the photo, and is decorative", () => {
    expect(initials("Ananya Kulkarni")).toBe("AK");
    expect(initials("  ")).toBe("?");
    const { container } = render(
      <>
        <Avatar name="Ananya" photoURL={null} />
        <Avatar name="Ananya" photoURL="https://lh3.googleusercontent.com/a/photo" size={48} />
      </>,
    );
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });
});

describe("data hooks", () => {
  it("ServicesProvider defaults to the stubs and must wrap its users", () => {
    const { result } = renderHook(() => useServices(), { wrapper: ({ children }) => <ServicesProvider>{children}</ServicesProvider> });
    expect(result.current.events).toBeDefined();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useServices())).toThrow("useServices must be used inside <ServicesProvider>");
  });

  it("useAsync loads, reports errors and retries", async () => {
    let fail = true;
    const load = vi.fn(async () => {
      if (fail) throw new Error("offline");
      return 42;
    });
    const { result } = renderHook(() => useAsync(load));
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    fail = false;
    result.current.retry();
    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", data: 42 }));
  });

  it("useAsync ignores a request cancelled by unmounting", async () => {
    const load = vi.fn(
      (signal: AbortSignal) =>
        new Promise<number>((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))),
    );
    const { unmount } = renderHook(() => useAsync(load));
    unmount();
    expect(load.mock.calls[0][0].aborted).toBe(true);
  });

  it("useToday reads India's date on the client", () => {
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe(todayInIndia());
  });
});
