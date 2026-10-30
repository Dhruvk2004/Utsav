import type { Locator } from "@playwright/test";

/**
 * Clicks `locator` once React has hydrated its element (React tags every hydrated node with its
 * props). On a cold server the server-rendered page can be visible and clickable before the
 * client router owns its links, and a click in that window can be lost (QA-18).
 */
export async function clickWhenHydrated(locator: Locator): Promise<void> {
  await whenHydrated(locator);
  await locator.click();
}

/**
 * Resolves once React has hydrated `locator`'s element, so typing into it reaches its handlers.
 * Polls on a timer, not on animation frames, which a background tab does not run.
 */
export async function whenHydrated(locator: Locator): Promise<void> {
  await locator.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        const check = () => (Object.keys(element).some((key) => key.startsWith("__reactProps$")) ? resolve() : setTimeout(check, 20));
        check();
      }),
  );
}
