import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

// Every page a signed-out visitor can reach, checked with axe in both colour schemes once its
// content has loaded. Signed-in pages are covered by e2e/signed-in (npm run test:e2e:emulators).
const PAGES = [
  { path: "/", ready: "Plan the celebration, not the chaos." },
  { path: "/privacy", ready: "Privacy and AI" },
  { path: "/signin", ready: "Sign in to save your plans" },
  { path: "/no-such-page", ready: "We couldn't find that page." },
  { path: "/demo", ready: "Try Utsav without signing in" },
  { path: "/demo/wedding", ready: "Sample wedding" },
  { path: "/demo/wedding?tab=budget", ready: "Sample wedding" },
  { path: "/demo/wedding?tab=timeline", ready: "Sample wedding" },
  { path: "/demo/wedding?tab=vendors", ready: "Sample wedding" },
  { path: "/demo/birthday", ready: "Sample 6th birthday" },
  { path: "/demo/community", ready: "Sample Diwali celebration" },
  { path: `/s/${"a".repeat(43)}`, ready: "We couldn't find that page." },
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });
    for (const { path, ready } of PAGES) {
      test(`${path} is accessible`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: ready })).toBeVisible();
        await expectNoA11yViolations(page);
      });
    }
  });
}

test("the skip link is the first Tab stop and lands on main", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard flow");
  await page.goto("/privacy");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

test("public pages reach sign-in with a full page load, so Google's script gets the sign-in policy", async ({ page }) => {
  // A client-side move would keep the public page's stricter CSP, which blocks Google sign-in (found on the live site).
  await page.goto("/");
  await page.evaluate(() => Object.assign(window, { sameDocument: true }));
  await page
    .getByRole("link", { name: /sign in|continue with google/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/signin/);
  await expect(page.getByRole("heading", { name: "Sign in to save your plans" })).toBeVisible();
  expect(await page.evaluate(() => "sameDocument" in window)).toBe(false);
});

test("an unknown page returns 404 and sign-in explains the missing configuration", async ({ page, request }) => {
  expect((await request.get("/no-such-page")).status()).toBe(404);
  await page.goto("/signin");
  await expect(page.getByText("Sign-in isn't configured on this deployment.")).toBeVisible();
});

test("signed-in pages send signed-out visitors to sign-in and back (spec 3.3)", async ({ page }) => {
  for (const path of ["/dashboard", "/events/new", "/settings", "/onboarding?rerun=1", "/events/e1/budget?ai=open"]) {
    await page.goto(path);
    await expect(page).toHaveURL(`/signin?next=${encodeURIComponent(path)}`);
  }
  await page.goto("/signin?next=/settings");
  await expect(page.getByRole("heading", { name: "Sign in to save your plans" })).toBeVisible();
});

test("a stale session cookie is cleared instead of locking the visitor out of the landing page", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "__session", value: "expired-or-forged", url: baseURL! }]);
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Plan the celebration, not the chaos." })).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.name === "__session")).toBe(false);
});

test("sends security headers", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});
