import { expect, type Page } from "@playwright/test";
import { newUser, signIn, type TestUser } from "./auth";

/** Shared steps for the signed-in specs: onboarding and event creation through the real UI. */

/** Today in India as YYYY-MM-DD, plus `days`; the app's own clock is IST (spec 9). */
export function istDate(days = 0): string {
  const now = new Date(Date.now() + 5.5 * 3_600_000 + days * 86_400_000);
  return now.toISOString().slice(0, 10);
}

/** Signs in a fresh user and completes onboarding (city Pune, own family wedding, skips the rest). */
export async function onboard(page: Page, user: TestUser = newUser()): Promise<TestUser> {
  const { onboarded } = await signIn(page, user);
  expect(onboarded).toBe(false);
  await page.goto("/dashboard");
  // Guard table 3.3: a signed-in user who has not onboarded is sent to onboarding.
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${user.name.split(" ")[0]}. Let's set you up.` })).toBeVisible();
  const city = page.getByRole("combobox", { name: "Home city" });
  await city.fill("Pune");
  await page.getByRole("option", { name: /^Pune/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("My own or family celebration", { exact: true }).click();
  await page.getByRole("button", { name: "Wedding" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByText("Balanced", { exact: true }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("link", { name: "Create your first event" })).toBeVisible();
  return user;
}

export interface NewEvent {
  title: string;
  date?: string;
  guests?: string;
  budget?: string;
}

/** Creates a wedding with the default functions; the scripted model fails, so the starter template answers. */
export async function createWedding(
  page: Page,
  { title, date = istDate(120), guests = "300", budget = "2500000" }: NewEvent,
): Promise<string> {
  await page.goto("/events/new");
  await expect(page.getByRole("heading", { level: 2, name: /^Step 1 of 3/ })).toBeVisible();
  await page.getByText("Wedding", { exact: true }).click();
  await page.getByLabel("Title (optional)").fill(title);
  await page.getByLabel("Event date").fill(date);
  await page.getByLabel("Guests").fill(guests);
  await page.getByLabel("Total budget").fill(budget);
  await page.getByRole("button", { name: "Next: Shape" }).click();
  await page.getByRole("button", { name: "Next: Who it's for" }).click();
  await page.getByRole("button", { name: "Create my plan" }).click();
  await expect(page).toHaveURL(/\/events\/[A-Za-z0-9]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2];
}

/** Signed in, onboarded, with one wedding; returns the event id. */
export async function weddingReady(page: Page, title = "Asha and Rohan's wedding"): Promise<{ user: TestUser; eventId: string }> {
  const user = await onboard(page);
  const eventId = await createWedding(page, { title });
  return { user, eventId };
}
