import { expect, test, type Browser, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "../axe";
import { signIn } from "./auth";
import { weddingReady } from "./flows";

// axe (WCAG 2.2 AA) on every signed-in page of spec 3.1 in both colour schemes, on desktop and
// mobile, plus the AI panel with cards, the What-if sheet and the vendor drawer open. One user and
// one event per worker; each test opens its own context with that session.

type StorageState = Awaited<ReturnType<ReturnType<Page["context"]>["storageState"]>>;

let session: { state: StorageState; eventId: string } | null = null;

async function signedIn(
  browser: Browser,
  colorScheme: "light" | "dark",
  isMobile: boolean,
  viewport: { width: number; height: number } | null,
) {
  if (!session) {
    const setup = await browser.newPage();
    const { eventId } = await weddingReady(setup);
    session = { state: await setup.context().storageState(), eventId };
    await setup.close();
  }
  const context = await browser.newContext({ storageState: session.state, colorScheme, isMobile, viewport, hasTouch: isMobile });
  return { page: await context.newPage(), eventId: session.eventId };
}

const PAGES = [
  { name: "dashboard", path: () => "/dashboard", ready: /My events|Your events|events/i },
  { name: "new event", path: () => "/events/new", ready: /^Step 1 of 3/ },
  { name: "account settings", path: () => "/settings", ready: "Settings" },
  { name: "onboarding re-run", path: () => "/onboarding?rerun=1", ready: /Welcome/ },
  { name: "overview", path: (id: string) => `/events/${id}`, ready: "Asha and Rohan's wedding" },
  { name: "budget", path: (id: string) => `/events/${id}/budget`, ready: "Asha and Rohan's wedding" },
  { name: "budget by function", path: (id: string) => `/events/${id}/budget?view=functions`, ready: "Asha and Rohan's wedding" },
  { name: "timeline", path: (id: string) => `/events/${id}/timeline`, ready: "Asha and Rohan's wedding" },
  { name: "vendors", path: (id: string) => `/events/${id}/vendors`, ready: "Asha and Rohan's wedding" },
  { name: "ideas", path: (id: string) => `/events/${id}/ideas`, ready: "Asha and Rohan's wedding" },
  { name: "guests", path: (id: string) => `/events/${id}/guests`, ready: "Asha and Rohan's wedding" },
  { name: "event settings", path: (id: string) => `/events/${id}/settings`, ready: "Asha and Rohan's wedding" },
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} scheme`, () => {
    for (const { name, path, ready } of PAGES) {
      test(`${name} is accessible`, async ({ browser, isMobile, viewport }) => {
        const { page, eventId } = await signedIn(browser, scheme, isMobile, viewport);
        await page.goto(path(eventId));
        await expect(page.getByRole("heading", { name: ready }).first()).toBeVisible();
        await expectNoA11yViolations(page);
        await page.context().close();
      });
    }

    test("AI mode with suggestion cards is accessible", async ({ browser, isMobile, viewport }) => {
      const { page, eventId } = await signedIn(browser, scheme, isMobile, viewport);
      await page.goto(`/events/${eventId}/timeline`);
      await page.getByRole("button", { name: /^AI mode/ }).click();
      await page.getByLabel("Tell Utsav what to change").fill("Plan the extras");
      await page.getByRole("button", { name: "Suggest" }).click();
      await expect(page.getByRole("button", { name: /^Accept all valid/ })).toBeVisible();
      await expectNoA11yViolations(page);
      await page.context().close();
    });

    test("What-if sheet and vendor drawer are accessible", async ({ browser, isMobile, viewport }) => {
      const { page, eventId } = await signedIn(browser, scheme, isMobile, viewport);
      await page.goto(`/events/${eventId}/budget`);
      await page.getByRole("button", { name: "Change total / What if?" }).click();
      await page.getByRole("dialog", { name: "What if the budget changes?" }).getByLabel("New total").fill("2000000");
      await expectNoA11yViolations(page);
      await page.keyboard.press("Escape");
      await page.goto(`/events/${eventId}/vendors`);
      await page.getByRole("button", { name: "Open Caterer" }).click();
      await expect(page.getByRole("dialog", { name: "Caterer" })).toBeVisible();
      await expectNoA11yViolations(page);
      await page.context().close();
    });
  });
}

test("first-run onboarding is accessible", async ({ page }) => {
  await signIn(page);
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { level: 1, name: /Welcome/ })).toBeVisible();
  await expectNoA11yViolations(page);
});
