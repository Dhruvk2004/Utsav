import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { GuardFallback, RouteGuard } from "@/components/auth/RouteGuard";

const target = vi.hoisted(() => ({ value: null as string | null, calls: [] as unknown[][] }));
vi.mock("@/lib/server/loaders/viewer", () => ({
  guardTarget: async (...args: unknown[]) => {
    target.calls.push(args);
    return target.value;
  },
}));

describe("RouteGuard (spec 3.3)", () => {
  it("renders the page when the guard lets the viewer through", async () => {
    target.value = null;
    render(await RouteGuard({ route: "app", children: <p>Dashboard</p> }));
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects otherwise, passing the page's search params to the guard", async () => {
    target.value = "/signin?next=%2Fonboarding";
    const searchParams = Promise.resolve({ rerun: "1" });
    await RouteGuard({ route: "onboarding", searchParams, children: <p>Onboarding</p> });
    expect(redirect).toHaveBeenCalledWith("/signin?next=%2Fonboarding");
    expect(target.calls.at(-1)).toEqual(["onboarding", searchParams]);
  });

  it("shows a busy page skeleton while checking", () => {
    render(<GuardFallback />);
    expect(screen.getByRole("main")).toContainElement(screen.getByText("Loading"));
  });
});
