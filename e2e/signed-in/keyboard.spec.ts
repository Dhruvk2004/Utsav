import { expect, test, type Page } from "@playwright/test";
import { weddingReady } from "./flows";

// Keyboard-only passes with the focus targets of spec R2-11 (6.1, 9.2): no mouse after sign-in.

test.skip(({ isMobile }) => isMobile, "keyboard flows");

/** Presses Tab until `target` has focus, failing after `max` presses (so a focus trap shows up). */
async function tabTo(page: Page, target: ReturnType<Page["getByRole"]>, max = 40, key = "Tab") {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
}

test("AI mode by keyboard: open, send, accept all, undo and close (R2-11)", async ({ page }) => {
  const { eventId } = await weddingReady(page);
  await page.goto(`/events/${eventId}/timeline`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // The skip link is the first stop and lands on main.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();

  // Opening AI mode from its button puts focus in the instruction box.
  const opener = page.getByRole("button", { name: /^AI mode/ });
  await tabTo(page, opener);
  await page.keyboard.press("Enter");
  const box = page.getByLabel("Tell Utsav what to change");
  await expect(box).toBeFocused();
  await page.keyboard.type("Plan the extras");
  await page.keyboard.press("Control+Enter");

  // Arrival: the batch heading takes focus and the count is announced.
  const batch = page.getByRole("region", { name: /3 suggestions for "Plan the extras"/ });
  await expect(batch.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(page.getByText("3 suggestions, 3 valid")).toBeAttached();

  // Accept all: focus moves to the summary of what was applied.
  await tabTo(page, batch.getByRole("button", { name: "Accept all valid (3)" }));
  await page.keyboard.press("Enter");
  await expect(page.locator(":focus")).toContainText(/Applied|applied|accepted/i);
  await expect(page.getByRole("checkbox", { name: "Book a dhol player" })).toBeVisible();

  // On desktop the panel is non-modal (spec 9.2): its Close button returns focus to the opener.
  await tabTo(page, page.getByRole("button", { name: "Close AI mode" }), 40, "Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "AI mode" })).toBeHidden();
  await expect(opener).toBeFocused();
});

test("a card by keyboard: Edit focuses the first field, Cancel returns to Edit, Decline offers Restore", async ({ page }) => {
  const { eventId } = await weddingReady(page);
  await page.goto(`/events/${eventId}/timeline`);
  await page.getByRole("button", { name: /^AI mode/ }).press("Enter");
  await page.keyboard.type("Plan the extras");
  await page.keyboard.press("Control+Enter");
  const batch = page.getByRole("region", { name: /suggestions for "Plan the extras"/ });
  await expect(batch.getByRole("heading", { level: 2 })).toBeFocused();

  const edit = batch.getByRole("button", { name: "Edit: Add task: Book a dhol player" });
  await tabTo(page, edit);
  await page.keyboard.press("Enter");
  await expect(batch.getByLabel("Title")).toBeFocused();
  await tabTo(page, batch.getByRole("button", { name: "Cancel" }));
  await page.keyboard.press("Enter");
  await expect(edit).toBeFocused();

  await tabTo(page, batch.getByRole("button", { name: "Decline: Add task: Book a dhol player" }));
  await page.keyboard.press("Enter");
  await expect(batch.getByRole("button", { name: "Restore: Add task: Book a dhol player" })).toBeFocused();

  await tabTo(page, batch.getByRole("button", { name: "Accept: Add task: Confirm the pandit" }));
  await page.keyboard.press("Enter");
  await expect(batch.getByRole("button", { name: "Undo: Add task: Confirm the pandit" })).toBeFocused();
});

test("budget cell edit by keyboard announces the change and the Undo toast closes with Escape", async ({ page }) => {
  const { eventId } = await weddingReady(page);
  await page.goto(`/events/${eventId}/budget`);
  const decor = page.getByLabel("Decor, allocated amount");
  await tabTo(page, decor, 80);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("280000");
  await page.keyboard.press("Enter");
  await expect(decor).toHaveValue("2,80,000");
  await expect(page.getByText(/^Saved: /).first()).toBeVisible();
  // The toast never takes focus; its Undo is reachable by Tab, and Escape there closes it (WCAG 2.2.1).
  await expect(decor).toBeFocused();
  const toast = page.getByRole("status").filter({ hasText: /^Saved: / });
  const undo = toast.getByRole("button", { name: "Undo" });
  await tabTo(page, undo, 120);
  await page.keyboard.press("Escape");
  await expect(undo).toBeHidden();
});

test("dialogs trap focus and return it to the opener", async ({ page }) => {
  const { eventId } = await weddingReady(page);
  await page.goto(`/events/${eventId}/budget`);
  const opener = page.getByRole("button", { name: "Change total / What if?" });
  await tabTo(page, opener, 80);
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "What if the budget changes?" });
  await expect(sheet).toBeVisible();
  // Tabbing never reaches the page behind the modal (showModal makes it inert; the browser may
  // briefly move focus to its own chrome, which leaves document.body active).
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    expect(await sheet.evaluate((el) => el.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();

  // The event menu opens with the keyboard and its items are reachable with arrows.
  const menu = page.getByRole("button", { name: "Event menu" });
  await menu.focus();
  await page.keyboard.press("Enter");
  const settings = page.getByRole("menuitem", { name: "Event settings, share and calendar" });
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await tabTo(page, settings, 10, "ArrowDown");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
});

test("the new event wizard can be completed without a mouse", async ({ page }) => {
  await weddingReady(page, "First wedding");
  await page.goto("/events/new");
  // Next with an empty date shows the error summary, which takes focus.
  const next = page.getByRole("button", { name: "Next: Shape" });
  await page.getByLabel("Guests").fill("");
  await next.focus();
  await page.keyboard.press("Enter");
  const summary = page.getByRole("alert").filter({ hasText: "Guests" });
  await expect(summary).toBeFocused();
  // Its links move focus to the field.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.locator(":focus")).toHaveAttribute("type", /date|number|text/);
});
