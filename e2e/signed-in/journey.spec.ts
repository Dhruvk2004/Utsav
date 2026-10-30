import { expect, test, type Page } from "@playwright/test";
import { BASE_URL, signIn } from "./auth";
import { whenHydrated } from "../hydration";
import { createWedding, istDate, onboard, weddingReady } from "./flows";

// The signed-in journey of spec 12.4 flow (1), split into independent tests: each signs in as its
// own Google user against the Auth emulator and stores its plan in the Firestore emulator.

const tab = (page: Page, name: string | RegExp) => page.getByRole("navigation", { name: "Event sections" }).getByRole("link", { name });
const aiPanel = (page: Page) => page.getByRole("complementary", { name: "AI mode" });

async function instruct(page: Page, instruction: string) {
  const panel = aiPanel(page);
  if (!(await panel.isVisible())) await page.getByRole("button", { name: /^AI mode/ }).click();
  await panel.getByLabel("Tell Utsav what to change").fill(instruction);
  await panel.getByRole("button", { name: "Suggest" }).click();
  return panel.getByRole("region", { name: new RegExp(`suggestions? for "${instruction}"`) });
}

test.describe("guards and onboarding (spec 3.3)", () => {
  test("a new user is onboarded, then the guards route by profile state", async ({ page }) => {
    const user = await onboard(page);
    // Onboarded: `/`, `/signin` and `/onboarding` go to the dashboard; `?next=` is honoured.
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/signin");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/signin?next=/settings");
    await expect(page).toHaveURL(/\/settings$/);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/dashboard$/);
    // Re-run keeps the saved answers.
    await page.goto("/onboarding?rerun=1");
    await expect(page.getByRole("combobox", { name: "Home city" })).toHaveValue(/Pune/);
    await expect(page.getByLabel("Your name")).toHaveValue(user.name);
    // The empty dashboard offers one primary action.
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /Create (your first|an) event/ }).first()).toBeVisible();
  });

  test("an open redirect through ?next= is refused", async ({ page }) => {
    await onboard(page);
    for (const next of ["https://evil.example/", "//evil.example/", "/\\evil.example"]) {
      await page.goto(`/signin?next=${encodeURIComponent(next)}`);
      expect(new URL(page.url()).origin).toBe(BASE_URL);
    }
  });

  test("someone else's event answers 404 and its APIs never leak it", async ({ page, browser }) => {
    const { eventId } = await weddingReady(page);
    const other = await browser.newPage();
    await onboard(other);
    await other.goto(`/events/${eventId}/budget`);
    await expect(other.getByRole("heading", { name: "We couldn't find that page." })).toBeVisible();
    await expect(other.getByText("Asha and Rohan's wedding")).toHaveCount(0);
    expect((await other.request.get(`/api/events/${eventId}`)).status()).toBe(404);
    expect((await other.request.get(`/api/events/${eventId}/calendar.ics`)).status()).toBe(404);
    expect(
      (await other.request.delete(`/api/events/${eventId}`, { headers: { origin: BASE_URL }, data: { confirmTitle: "x" } })).status(),
    ).toBe(404);
    await other.close();
  });

  test("someone else's event page answers HTTP 404, not 200 (QA-05)", async ({ page, browser }) => {
    const { eventId } = await weddingReady(page);
    const other = await browser.newPage();
    await onboard(other);
    const response = await other.goto(`/events/${eventId}/budget`);
    expect(response?.status()).toBe(404);
    await other.close();
  });

  test("writes without the app's Origin are refused (CSRF)", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    const response = await page.request.post(`/api/events/${eventId}/share`, {
      headers: { origin: "https://evil.example" },
      data: { showAmounts: true, showNotes: false },
    });
    expect(response.status()).toBe(403);
  });
});

test.describe("create and edit the plan", () => {
  test("creates a template wedding that shows on the dashboard", async ({ page }) => {
    await onboard(page);
    await createWedding(page, { title: "Meera's wedding", date: istDate(90), guests: "5000", budget: "99999999" });
    // The creation fell back to the starter template (the scripted model is unavailable for plans).
    await expect(page.getByText("Starter template", { exact: true })).toBeVisible();
    await expect(page.getByText("Started from a template because AI was unavailable.")).toBeVisible();
    // Indian grouping in the header: 9,99,99,999 and 5,000 guests.
    await expect(page.getByText("₹9,99,99,999").first()).toBeVisible();
    await expect(page.getByText(/5,?000 guests/).first()).toBeVisible();
    await page.getByRole("link", { name: "My events" }).click();
    // Exactly one event: creation runs once per click.
    await expect(page.getByRole("link", { name: /Meera's wedding/ })).toHaveCount(1);
  });

  test("double-clicking Create my plan creates one event", async ({ page }) => {
    await onboard(page);
    await page.goto("/events/new");
    await page.getByLabel("Title (optional)").fill("Once only");
    await page.getByLabel("Event date").fill(istDate(100));
    await page.getByLabel("Guests").fill("200");
    await page.getByLabel("Total budget").fill("1500000");
    await page.getByRole("button", { name: "Next: Shape" }).click();
    await page.getByRole("button", { name: "Next: Who it's for" }).click();
    await page.getByRole("button", { name: "Create my plan" }).dblclick();
    await expect(page.getByRole("heading", { level: 1, name: "Once only" })).toBeVisible({ timeout: 30_000 });
    const { events } = (await (await page.request.get("/api/events")).json()) as { events: unknown[] };
    expect(events).toHaveLength(1);
  });

  test("guest counts use Indian grouping in the header (QA-06 regression)", async ({ page }) => {
    await onboard(page);
    await createWedding(page, { title: "Big wedding", guests: "5000" });
    await expect(page.getByText("5,000 guests", { exact: true })).toBeVisible();
    await expect(page.getByText(/for 5,000 guests\./)).toBeVisible();
  });

  test("budget, task and vendor edits persist across a reload", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/budget`);
    const decor = page.getByLabel("Decor, allocated amount");
    await decor.fill("280000");
    await decor.press("Enter");
    await expect(page.getByRole("row", { name: /^Total/ })).toContainText("₹25,00,000");
    await page.reload();
    await expect(page.getByLabel("Decor, allocated amount")).toHaveValue("2,80,000");

    await tab(page, "Timeline").click();
    const task = page.getByRole("checkbox", { name: "Book the venue" });
    await task.click();
    await expect(task).toBeChecked();
    await expect(page.getByText(/^1 of \d+ done/).first()).toBeVisible();

    await tab(page, /^Vendors/).click();
    await page.getByLabel("Status of Venue").selectOption("booked");
    await page.getByLabel("Quoted amount (required to mark booked)").fill("600000");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("region", { name: "Booked (1)" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("region", { name: "Booked (1)" })).toContainText("Venue");
    await tab(page, "Overview").click();
    await expect(page.getByRole("definition").filter({ hasText: "₹6,00,000" }).first()).toBeVisible();
    await tab(page, "Timeline").click();
    await expect(page.getByRole("checkbox", { name: "Book the venue" })).toBeChecked();
  });

  test("guest counts persist and update the catering estimate", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/guests`);
    await page.getByLabel("Kids (under 12) (optional)").fill("40");
    await page.getByLabel("Elderly (65+) (optional)").fill("25");
    await page.getByRole("button", { name: "Save counts" }).click();
    await page.reload();
    await expect(page.getByLabel("Kids (under 12) (optional)")).toHaveValue("40");
    await expect(page.getByRole("status").filter({ hasText: "Plates" })).toContainText("330");
  });
});

test.describe("AI mode with the scripted model (spec 6.1)", () => {
  test("accept, edit, decline, restore and undo cards", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/timeline`);
    const batch = await instruct(page, "Plan the extras");
    await expect(batch.getByRole("heading", { level: 2 })).toBeFocused();
    await expect(batch.getByText("3 valid")).toBeVisible();

    // Accept: the line shows Applied and its Undo takes focus (R2-11).
    await batch.getByRole("button", { name: "Accept: Add task: Book a dhol player" }).click();
    const undo = batch.getByRole("button", { name: "Undo: Add task: Book a dhol player" });
    await expect(undo).toBeFocused();
    await expect(page.getByRole("checkbox", { name: "Book a dhol player" })).toBeVisible();

    // Decline: the line offers Restore and it takes focus (restoring is QA-01, below).
    await batch.getByRole("button", { name: "Decline: Idea: Marigold welcome arch" }).click();
    await expect(batch.getByRole("button", { name: "Restore: Idea: Marigold welcome arch" })).toBeFocused();

    // Edit: the first field takes focus, the edit is saved and accepted as the user's.
    await batch.getByRole("button", { name: "Edit: Add task: Confirm the pandit" }).click();
    const title = batch.getByLabel("Title");
    await expect(title).toBeFocused();
    await title.fill("Confirm the priest");
    await batch.getByRole("button", { name: "Save and accept" }).click();
    await expect(batch.getByText(/\(edited by you\)/)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Confirm the priest" })).toBeVisible();

    // Undo the latest change; the earlier one can no longer be undone from its card.
    await batch
      .getByRole("button", { name: /^Undo: / })
      .first()
      .click();
    await expect(page.getByRole("checkbox", { name: "Confirm the priest" })).toHaveCount(0);

    // Everything decided is stored: a reload shows the accepted dhol task and not the undone one.
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Book a dhol player" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Confirm the priest" })).toHaveCount(0);
  });

  test("two quick Accepts in one tab both apply, with no false conflict (QA-19 regression)", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/timeline`);
    const batch = await instruct(page, "Plan the extras");
    await expect(batch.getByText("3 valid")).toBeVisible();
    // Hold every decision 1.5 s, so the second Accept is clicked before the first is answered.
    const bases: number[] = [];
    await page.route("**/decide", async (route) => {
      bases.push((route.request().postDataJSON() as { baseVersion: number }).baseVersion);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });
    await batch.getByRole("button", { name: "Accept: Add task: Book a dhol player" }).click();
    await batch.getByRole("button", { name: "Accept: Add task: Confirm the pandit" }).click();
    await expect(batch.getByRole("button", { name: "Undo: Add task: Confirm the pandit" })).toBeVisible();
    await expect(batch.getByText(/^Applied:/)).toHaveCount(2);
    await expect(page.getByText("This plan changed in another tab. Reloaded the latest version.")).toHaveCount(0);
    // The second request waited for the first and carried the version it left.
    expect(bases).toHaveLength(2);
    expect(bases[1]).toBe(bases[0] + 1);
    await page.unroute("**/decide");
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Book a dhol player" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Confirm the pandit" })).toBeVisible();
  });

  test("double-clicking a card's Undo undoes once, with no 'Undo unavailable' (QA-20 regression)", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/timeline`);
    const batch = await instruct(page, "Plan the extras");
    await batch.getByRole("button", { name: "Accept: Add task: Book a dhol player" }).click();
    const undo = batch.getByRole("button", { name: "Undo: Add task: Book a dhol player" });
    await expect(undo).toBeFocused();
    const undos: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith(`/api/events/${eventId}/undo`)) undos.push(request.url());
    });
    await undo.dblclick();
    await expect(batch.getByRole("button", { name: "Accept: Add task: Book a dhol player" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Book a dhol player" })).toHaveCount(0);
    await expect(page.getByText(/Undo unavailable/)).toHaveCount(0);
    expect(undos).toHaveLength(1);
  });

  test("a declined card can be restored (QA-01 regression)", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/timeline`);
    const batch = await instruct(page, "Plan the extras");
    await batch.getByRole("button", { name: "Decline: Idea: Marigold welcome arch" }).click();
    await batch.getByRole("button", { name: "Restore: Idea: Marigold welcome arch" }).click();
    await expect(batch.getByRole("button", { name: "Accept: Idea: Marigold welcome arch" })).toBeFocused({ timeout: 5_000 });
  });

  test("cut decor by 20%, then a follow-up, then undo", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/budget`);
    const first = await instruct(page, "Cut decor spend by 20%");
    const card = first.getByRole("article", { name: /Reduce Decor by 20%/ });
    await expect(card).toContainText("₹3,00,000");
    await expect(card).toContainText("₹2,40,000");
    await card.getByRole("button", { name: /^Accept/ }).click();
    await expect(page.getByLabel("Decor, allocated amount")).toHaveValue("2,40,000");
    await expect(page.getByText("₹24,40,000").first()).toBeVisible();

    // The follow-up starts from the accepted amount (previous turns reach the model), and replaces
    // the earlier cut: 15% below the original ₹3,00,000, not 15% off ₹2,40,000 (MQW-06).
    const second = await instruct(page, "make that 15% instead");
    await expect(second.getByRole("article").first()).toContainText("₹2,40,000");
    await second
      .getByRole("button", { name: /^Accept/ })
      .first()
      .click();
    await expect(page.getByLabel("Decor, allocated amount")).toHaveValue("2,55,000");
    await second.getByRole("button", { name: /^Undo/ }).click();
    await expect(page.getByLabel("Decor, allocated amount")).toHaveValue("2,40,000");
  });

  test("a model failure leaves the plan unchanged and offers Retry", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/budget`);
    const before = await page.getByLabel("Decor, allocated amount").inputValue();
    await instruct(page, "Cause a server error");
    const alert = aiPanel(page).getByRole("alert").filter({ hasText: "Could not get suggestions." });
    await expect(alert).toContainText("Your plan is unchanged.");
    await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByLabel("Decor, allocated amount")).toHaveValue(before);
  });

  test("AI calls are limited to 6 a minute per user, plan generation included (spec 9.3)", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    const statuses: number[] = [];
    let retryAfter: string | undefined;
    // Creating the event just called the model once (the plan), so five more fit in this minute.
    for (let i = 1; i <= 6; i++) {
      const response = await page.request.post(`/api/events/${eventId}/ai/instruct`, {
        headers: { origin: BASE_URL },
        data: { instruction: `What can you do, take ${i}?` },
      });
      statuses.push(response.status());
      retryAfter ??= response.headers()["retry-after"];
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  test("a reply-only answer adds no cards", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}`);
    await instruct(page, "What can you do?");
    const answer = aiPanel(page)
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Answer" }) });
    await expect(answer).toContainText("I can help with budget, timeline, vendors and ideas.");
    await expect(aiPanel(page).getByRole("button", { name: /^Accept/ })).toHaveCount(0);
  });
});

test.describe("What-if, ideas and enquiries", () => {
  test("What-if: a simple rescale applies a new total", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/budget`);
    await page.getByRole("button", { name: "Change total / What if?" }).click();
    const sheet = page.getByRole("dialog", { name: "What if the budget changes?" });
    await sheet.getByLabel("New total").fill("2000000");
    await sheet.getByRole("button", { name: "Apply selected" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText("₹20,00,000").first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("row", { name: /^Total/ })).toContainText("₹20,00,000");
  });

  test("What-if: a smart re-plan keeps the total and offers trade-offs", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/budget`);
    await page.getByRole("button", { name: "Change total / What if?" }).click();
    const sheet = page.getByRole("dialog", { name: "What if the budget changes?" });
    await sheet.getByLabel("New total").fill("2200000");
    // Smart re-plan is offered only once the model has answered.
    await expect(sheet.getByRole("radio", { name: /^Smart re-plan/ })).toBeDisabled();
    await sheet.getByRole("button", { name: "Generate smart re-plan" }).click();
    await expect(sheet.getByRole("radio", { name: /^Smart re-plan/ })).toBeChecked();
    await expect(sheet.getByText("Food matters most to your guests")).toBeVisible();
    await expect(sheet.getByText("Ask for a buffet quote")).toBeVisible();
    // The notes and Trade-offs start below the table, never across its rows (MQR-01).
    const region = await sheet.getByRole("region", { name: "Budget before and after" }).boundingBox();
    const tradeoffs = await sheet.getByRole("heading", { name: "Trade-offs" }).boundingBox();
    expect(region && tradeoffs && tradeoffs.y >= region.y + region.height).toBe(true);
    await sheet.getByLabel("Decor, amount after").click({ timeout: 5_000 });
    await sheet.getByRole("button", { name: "Apply selected" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("row", { name: /^Total/ })).toContainText("₹22,00,000");
  });

  test("ideas: suggest, save one, dismiss one, add your own", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/ideas`);
    await expect(page.getByRole("heading", { name: "No ideas yet" })).toBeVisible();
    await page.getByRole("button", { name: "Food" }).click();
    await page.getByRole("button", { name: "Suggest ideas" }).click();
    await page.getByRole("button", { name: "Save: Idea: Masala chai counter" }).click();
    await page.getByRole("button", { name: "Dismiss: Idea: Rangoli corner for kids" }).click();
    await expect(page.getByRole("button", { name: "Restore: Idea: Rangoli corner for kids" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saved (1)" })).toBeVisible();
    await page.getByRole("button", { name: "Add your own idea" }).click();
    await page.getByLabel("Title").fill("रंगोली प्रतियोगिता");
    await page.getByRole("button", { name: "Save idea" }).click();
    await expect(page.getByRole("heading", { name: "Saved (2)" })).toBeVisible();
    await page.reload();
    await expect(page.getByText("रंगोली प्रतियोगिता")).toBeVisible();
    await expect(page.getByText("Masala chai counter")).toBeVisible();
  });

  test("enquiry: draft with the model, edit and save it on the vendor", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/vendors`);
    await page.getByRole("button", { name: "Open Caterer" }).click();
    const drawer = page.getByRole("dialog", { name: "Caterer" });
    await drawer.getByRole("button", { name: "Draft enquiry" }).click();
    const body = drawer.getByLabel(/^Message/);
    await expect(body).toHaveValue(/We are planning a wedding/);
    await body.press("End");
    await body.pressSequentially(" Thanks!");
    await expect(drawer.getByText("Edited by you")).toBeVisible();
    await drawer.getByRole("button", { name: "Save draft" }).click();
    await expect(drawer.getByRole("button", { name: /^View/ })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Open Caterer" }).click();
    await expect(page.getByRole("dialog", { name: "Caterer" }).getByRole("button", { name: /^View/ })).toBeVisible();
  });
});

test.describe("settings, share, calendar and delete (spec 12.5 step 7)", () => {
  test("share link: create, open signed out, revoke, then 404", async ({ page, browser }) => {
    test.slow();
    const { eventId } = await weddingReady(page, "Kavya's wedding");
    await page.goto(`/events/${eventId}/settings`);
    await page.getByRole("switch", { name: "Show amounts" }).click();
    await page.getByRole("button", { name: "Create link" }).click();
    const link = page.getByRole("textbox", { name: "Link" });
    await expect(link).toHaveValue(new RegExp(`^${BASE_URL}/s/[A-Za-z0-9_-]{43}$`));
    const url = await link.inputValue();

    const visitor = await browser.newPage();
    await visitor.goto(url);
    await expect(visitor.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(visitor.getByText("₹25,00,000").first()).toBeVisible();
    // Read-only: no editing controls, no title the owner kept private, no AI mode.
    await expect(visitor.getByRole("button", { name: /^AI mode/ })).toHaveCount(0);
    await expect(visitor.getByRole("textbox")).toHaveCount(0);

    await page.getByRole("button", { name: "Turn off link" }).click();
    await expect(page.getByRole("button", { name: "Create link" })).toBeVisible();
    // Revocation clears the projection cache on the instance that revoked it (QA-04 regression).
    await visitor.reload();
    await expect(visitor.getByRole("heading", { name: "We couldn't find that page." })).toBeVisible();

    // A new link is a new token; the old one stays dead.
    await page.getByRole("button", { name: "Create link" }).click();
    await expect(link).not.toHaveValue(url);
    await visitor.goto(url);
    await expect(visitor.getByRole("heading", { name: "We couldn't find that page." })).toBeVisible();
    await visitor.close();
  });

  test("turning a link off closes it at once on this instance (QA-04 regression)", async ({ page, browser }) => {
    const { eventId } = await weddingReady(page);
    const created = await page.request.post(`/api/events/${eventId}/share`, {
      headers: { origin: BASE_URL },
      data: { showAmounts: true, showNotes: false },
    });
    const { url } = (await created.json()) as { url: string };
    const visitor = await browser.newPage();
    await visitor.goto(url);
    await expect(visitor.getByText("Shared plan (read-only)")).toBeVisible();
    expect((await page.request.delete(`/api/events/${eventId}/share`, { headers: { origin: BASE_URL } })).status()).toBe(204);
    await visitor.reload();
    await expect(visitor.getByRole("heading", { name: "We couldn't find that page." })).toBeVisible({ timeout: 3_000 });
  });

  test(".ics downloads with the event and functions", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/settings`);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download .ics" }).click()]);
    const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString("utf8"));
    expect(text).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(text).toContain("SUMMARY:Haldi");
    expect(text).toContain("SUMMARY:Reception");
    expect(text.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    const response = await page.request.get(`/api/events/${eventId}/calendar.ics`);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["content-type"]).toContain("text/calendar");
  });

  test("details edit with a date preview, then delete with the typed title", async ({ page }) => {
    const { eventId } = await weddingReady(page, "Old title");
    await page.goto(`/events/${eventId}/settings`);
    await page.getByLabel("Event name (optional)").fill("Riya's wedding");
    await page.getByLabel("Event date").fill(istDate(150));
    await expect(page.getByText(/move|moves|shift/i).first()).toBeVisible();
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Riya's wedding" })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Event date")).toHaveValue(istDate(150));

    await page.getByRole("button", { name: "Delete event" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this event?" });
    const confirm = dialog.getByRole("button", { name: "Delete for good" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Type “Riya's wedding” to confirm").fill("Riya's wedding");
    await confirm.click();
    await expect(page).toHaveURL(/\/dashboard$/);
    expect((await page.request.get(`/api/events/${eventId}`)).status()).toBe(404);
  });

  test("profile settings save and survive a reload", async ({ page }) => {
    await onboard(page);
    await page.goto("/settings");
    await page.getByRole("textbox", { name: "Name" }).fill("आशा वर्मा");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("आशा वर्मा");
    await expect(page.getByRole("button", { name: /account menu/ })).toContainText("आशा");
  });
});

test.describe("concurrency and failures (spec 3.4)", () => {
  test("a stale tab gets the conflict message and reloads the latest version", async ({ page, context }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/budget`);
    const second = await context.newPage();
    await second.goto(`/events/${eventId}/budget`);
    const decor = second.getByLabel("Decor, allocated amount");
    await decor.fill("250000");
    await decor.press("Enter");
    await expect(second.getByLabel("Decor, allocated amount")).toHaveValue("2,50,000");
    // Saved on the server (the toast follows the 200), not just typed.
    await expect(second.getByText(/^Saved: /).first()).toBeVisible();

    const venue = page.getByLabel("Venue, allocated amount");
    await venue.fill("700000");
    await venue.press("Enter");
    // The stale tab is refused (409) and swaps in the latest plan: the other tab's Decor survives.
    await expect(page.getByLabel("Decor, allocated amount")).toHaveValue("2,50,000");
    await expect(page.getByLabel("Venue, allocated amount")).not.toHaveValue("7,00,000");
  });

  test("the stale tab is told its edit was not saved (QA-02 regression)", async ({ page, context }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/budget`);
    const venue = page.getByLabel("Venue, allocated amount");
    // Each step waits for the thing it depends on, never for a time (MQR-06): typing before React
    // owns the input, or a 5 s cap on a slow emulator save under three workers, made this flaky.
    await whenHydrated(venue);
    const second = await context.newPage();
    await second.goto(`/events/${eventId}/budget`);
    const decor = second.getByLabel("Decor, allocated amount");
    await whenHydrated(decor);
    await decor.fill("250000");
    await decor.press("Enter");
    await expect(decor).toHaveValue("2,50,000");
    // Saved on the server (the toast follows the 200), not just typed.
    await expect(second.getByText(/^Saved: /).first()).toBeVisible();
    await page.bringToFront();
    const refused = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.url().endsWith(`/api/events/${eventId}`),
    );
    await venue.fill("700000");
    await venue.press("Enter");
    expect((await refused).status()).toBe(409);
    await expect(page.getByText("This plan changed in another tab. Reloaded the latest version.")).toBeVisible();
    await expect(page.getByLabel("Decor, allocated amount")).toHaveValue("2,50,000");
  });

  test("offline: a banner says changes will not be saved (QA-03 regression)", async ({ page, context }) => {
    const { eventId } = await weddingReady(page);
    await page.goto(`/events/${eventId}/timeline`);
    const task = page.getByRole("checkbox").first();
    await expect(task).toBeEnabled();
    await context.setOffline(true);
    await expect(page.getByText("You are offline. Changes will not be saved.")).toBeVisible({ timeout: 5_000 });
    await expect(task).toBeDisabled();
    await context.setOffline(false);
    await expect(page.getByText("You are offline. Changes will not be saved.")).toHaveCount(0);
    await expect(task).toBeEnabled();
  });

  test("a PATCH with an old baseVersion answers 409", async ({ page }) => {
    const { eventId } = await weddingReady(page);
    const { event } = (await (await page.request.get(`/api/events/${eventId}`)).json()) as { event: { version: number } };
    const patch = (baseVersion: number) =>
      page.request.patch(`/api/events/${eventId}`, {
        headers: { origin: BASE_URL },
        data: { baseVersion, ops: [{ type: "set_summary", text: `v${baseVersion}` }] },
      });
    expect((await patch(event.version)).status()).toBe(200);
    expect((await patch(event.version)).status()).toBe(409);
  });

  test("signing out ends the session for every page", async ({ page }) => {
    await onboard(page);
    const response = await page.request.delete("/api/session", { headers: { origin: BASE_URL } });
    expect(response.status()).toBe(204);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/signin\?next=%2Fdashboard$/);
  });

  test("a second sign-in for the same Google account keeps the profile", async ({ page }) => {
    const user = await onboard(page);
    await page.context().clearCookies();
    const again = await signIn(page, user);
    expect(again.onboarded).toBe(true);
  });

  test("the session route rejects a forged token", async ({ page }) => {
    const response = await page.request.post("/api/session", {
      headers: { origin: BASE_URL, "x-forwarded-for": "203.0.113.9" },
      data: { idToken: "not-a-token" },
    });
    expect(response.status()).toBe(401);
  });
});
