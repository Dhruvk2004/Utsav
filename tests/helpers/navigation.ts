import { vi } from "vitest";

/** State behind the `next/navigation` mock in tests/setup.ts; tests set the URL and read the calls. */
export const navigation = {
  pathname: "/",
  searchParams: new URLSearchParams(),
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

/** Points the mocked router at `url` (path and query). */
export function setUrl(url: string) {
  const parsed = new URL(url, "https://utsav.test");
  navigation.pathname = parsed.pathname;
  navigation.searchParams = parsed.searchParams;
}

const history: string[] = [];

/** Back to "/" with fresh mocks; push and back move through a small history like the browser. */
export function resetNavigation() {
  setUrl("/");
  history.length = 0;
  for (const fn of [navigation.push, navigation.back, navigation.replace, navigation.refresh, navigation.prefetch]) fn.mockReset();
  navigation.push.mockImplementation((url: string) => {
    history.push(`${navigation.pathname}?${navigation.searchParams}`);
    setUrl(url);
  });
  navigation.back.mockImplementation(() => setUrl(history.pop() ?? "/"));
}
