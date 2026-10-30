import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { media } from "./helpers/media";
import { navigation, resetNavigation } from "./helpers/navigation";

// App Router hooks need a mounted router; tests drive this stand-in instead (tests/helpers/navigation.ts).
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

// Server-side suites (route handlers, proxy) run in the node environment, without a DOM.
const hasDom = typeof window !== "undefined";

// jsdom has no <dialog> methods yet; these follow the spec closely enough for focus and close events.
if (hasDom && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

// jsdom has no matchMedia: every query is false (the phone layout) unless a test sets `media.wide`
// (min-width queries) or `media.narrow` (max-width queries).
if (hasDom)
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("min-width") ? media.wide : query.includes("max-width") && media.narrow,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });

beforeEach(() => {
  resetNavigation();
  media.wide = false;
  media.narrow = false;
});

afterEach(() => {
  if (!hasDom) return;
  cleanup();
  localStorage.clear();
});
