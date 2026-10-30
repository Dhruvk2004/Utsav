import { describe, expect, it } from "vitest";
import { afterSignInPath, eventHref, safeNextPath } from "@/lib/client/navigation";

describe("safeNextPath", () => {
  it.each([
    ["/events/abc/budget?ai=open#top", "/events/abc/budget?ai=open#top"],
    ["/onboarding?rerun=1", "/onboarding?rerun=1"],
  ])("keeps the same-origin path %s", (next, expected) => expect(safeNextPath(next)).toBe(expected));

  it.each([
    null,
    undefined,
    "",
    "dashboard",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "https://evil.example/x",
    "javascript:alert(1)",
  ])("falls back for %s", (next) => expect(safeNextPath(next)).toBe("/dashboard"));
});

describe("afterSignInPath", () => {
  it("sends new users to onboarding and others to next", () => {
    expect(afterSignInPath(false, "/settings")).toBe("/onboarding");
    expect(afterSignInPath(true, "/settings")).toBe("/settings");
    expect(afterSignInPath(true, null)).toBe("/dashboard");
  });

  it("encodes event ids in links", () => {
    expect(eventHref("a b")).toBe("/events/a%20b");
  });
});
