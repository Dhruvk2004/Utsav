import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { clickWhenHydrated } from "./hydration";

test("landing to the demo chooser and into the sample wedding", async ({ page }) => {
  await page.goto("/");
  // The first test on a cold server: click only once React owns the link (QA-18).
  await clickWhenHydrated(page.getByRole("link", { name: "See a sample plan, no sign-in", exact: true }));
  await expect(page.getByRole("heading", { name: "Try Utsav without signing in" })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(3);
  await page.getByRole("link", { name: "Open sample wedding" }).click();
  await expect(page.getByRole("heading", { name: "Sample wedding" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Sample plan - not saved.");
  await expect(page.getByLabel("Tell Utsav what to change")).toHaveValue("Cut decor spend by 20%");
});

test("demo AI mode without live AI never answers a different request with a recording (MQW-08)", async ({ page }) => {
  await page.goto("/demo/wedding?tab=budget&ai=Sangeet+ka+budget+50+hazaar+badha+do");
  await clickWhenHydrated(page.getByRole("button", { name: "Suggest" }));
  await expect(page.getByText(/recorded examples only cover "Cut decor spend by 20%"/)).toBeVisible();
  // A reply with no cards is not a recorded example, and the panel says up front what works (MQR-03).
  await expect(page.getByText("Recorded example - live AI is off in this demo")).toHaveCount(0);
  await expect(page.getByText(/0 valid/)).toHaveCount(0);
  await expect(page.getByText("Live AI is off in this demo, so only the recorded examples below have answers.")).toBeVisible();
  const chips = page.getByRole("group", { name: "Example instructions" }).getByRole("button");
  await expect(chips).toHaveText(["Cut decor spend by 20%", "Make that 15% instead"]);
  await expect(page.getByRole("button", { name: /Accept all valid/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Accept/ })).toHaveCount(0);
});

test("demo AI mode: accept, follow up from the new amount, undo, and reload resets", async ({ page }) => {
  await page.goto("/demo/wedding?tab=budget&ai=Cut+decor+spend+by+20%25");
  await clickWhenHydrated(page.getByRole("button", { name: "Suggest" }));
  await expect(page.getByRole("heading", { name: '3 suggestions for "Cut decor spend by 20%"' })).toBeVisible();
  await expect(page.getByRole("article", { name: "Reduce Decor by 20%" })).toContainText("Recorded");
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Accept: Reduce Decor by 20%" }).click();
  const undo = page.getByRole("button", { name: "Undo: Reduce Decor by 20%" });
  await expect(undo).toBeFocused();
  await expect(page.getByRole("main")).toContainText("₹24,40,000");

  await page.getByLabel("Tell Utsav what to change").fill("make that 15% instead");
  await page.getByRole("button", { name: "Suggest" }).click();
  const followUp = page.getByRole("article", { name: "Change Decor cut from 20% to 15%" });
  await expect(followUp).toContainText("Replaces your earlier change");
  await expect(followUp).toContainText("₹2,40,000");
  await page.getByRole("button", { name: "Accept: Change Decor cut from 20% to 15%" }).click();
  await expect(page.getByRole("main")).toContainText("₹24,55,000");

  await page.getByRole("button", { name: "Undo: Change Decor cut from 20% to 15%" }).click();
  await expect(page.getByRole("main")).toContainText("₹24,40,000");
  await expect(page.getByRole("button", { name: "Accept: Change Decor cut from 20% to 15%" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Sample wedding" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("₹25,00,000");
});

test("What-if: nothing after the before/after table is drawn over it (MQR-01)", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 });
  await page.goto("/demo/wedding?tab=budget");
  await clickWhenHydrated(page.getByRole("button", { name: "What if?", exact: true }));
  await page.getByLabel("New total").fill("20,00,000");
  const table = page.getByRole("region", { name: "Budget before and after" });
  const after = page.getByText(/Function amounts will follow their shares/);
  await expect(after).toBeVisible();
  const [region, content, next] = await Promise.all([table.boundingBox(), table.locator("table").boundingBox(), after.boundingBox()]);
  if (!region || !content || !next) throw new Error("missing layout box");
  // The region keeps the table's full height, and the next item starts below it, not across its rows.
  expect(region.height).toBeGreaterThanOrEqual(content.height);
  expect(next.y).toBeGreaterThanOrEqual(region.y + region.height);
  // A row at the bottom of the table still takes the pointer.
  await page.getByLabel("Contingency, amount after").click({ timeout: 5_000 });
});

test("demo birthday ideas explain why, and Save then Undo works", async ({ page }) => {
  await page.goto("/demo/birthday");
  await clickWhenHydrated(page.getByRole("button", { name: "Suggest ideas" }));
  const card = page.getByRole("article", { name: "Idea: Peppa's muddy-puddle corner" });
  await expect(card).toContainText("Why this idea: loves Peppa Pig, turning 6");
  // This E2E server has no AI configured, so the label says live AI is off, never "busy" (MQW-08).
  await expect(page.getByText("Recorded example - live AI is off in this demo")).toBeVisible();
  await expectNoA11yViolations(page);
  await card.getByRole("button", { name: "Save: Idea: Peppa's muddy-puddle corner" }).click();
  await expect(page.getByRole("heading", { name: "Saved (5)" })).toBeVisible();
  await page.getByRole("button", { name: "Undo: Idea: Peppa's muddy-puddle corner" }).click();
  await expect(page.getByRole("heading", { name: "Saved (4)" })).toBeVisible();
});

test("demo community shows the rangoli idea, the Diwali warning and volunteer tasks", async ({ page }) => {
  await page.goto("/demo/community");
  await expect(page.getByRole("heading", { name: "Rangoli competition by age group" })).toBeVisible();
  await expect(page.getByText("Why this idea: Diwali, community event, 150 kids")).toBeVisible();
  await page.getByRole("button", { name: "Suggest ideas" }).click();
  await expect(page.getByRole("heading", { name: "New suggestions" })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Sample sections" });
  await tabs.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByText("Vendor demand is high around Diwali; book early.")).toBeVisible();
  await tabs.getByRole("link", { name: "Timeline" }).click();
  await expect(page.getByText("Form volunteer roster")).toBeVisible();
});

test("a malformed share token is not found", async ({ page }) => {
  await page.goto("/s/not-a-token");
  await expect(page.getByRole("heading", { name: "We couldn't find that page." })).toBeVisible();
});

const PHONE_PAGES = [
  "/demo",
  "/demo/wedding",
  "/demo/wedding?tab=budget",
  "/demo/wedding?tab=timeline",
  "/demo/wedding?tab=vendors",
  "/demo/wedding?tab=ideas",
  "/demo/birthday",
  "/demo/community",
];

test.describe("phone layout at 375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  for (const path of PHONE_PAGES) {
    test(`${path} has no horizontal scroll`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    });
  }
});
