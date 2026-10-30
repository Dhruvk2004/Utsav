import { expect, type Page } from "@playwright/test";

/**
 * Signs a page in through the real path: the Firebase Auth emulator issues a Google ID token (the
 * emulator's fake IdP), the browser posts it to `POST /api/session` like the sign-in card does, and
 * the server mints the httpOnly session cookie with the Admin SDK. No test-only route exists.
 */

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:3481";
/** The app's origin (APP_ORIGIN on the server), sent as the same-origin proof a browser would send. */
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3461";

export interface TestUser {
  uid: string;
  name: string;
  email: string;
}

let counter = 0;

/**
 * Sign-in is limited to 10 a minute per client IP (spec 9.3), and every test signs in from the
 * same machine. `next start` has no proxy in front, so the rightmost X-Forwarded-For hop is what
 * the app sees as the client (see QA-report); each sign-in claims its own address.
 */
function clientAddress(): string {
  return `198.51.100.${(process.pid + counter) % 250}`;
}

/** A unique Google identity per test, so tests never share Firestore state. */
export function newUser(name = "Asha Verma"): TestUser {
  counter += 1;
  const id = `${Date.now().toString(36)}${process.pid.toString(36)}${counter}`;
  return { uid: `google-${id}`, name, email: `e2e-${id}@example.com` };
}

async function emulatorIdToken(user: TestUser): Promise<string> {
  const claims = JSON.stringify({ sub: user.uid, email: user.email, email_verified: true, name: user.name });
  const response = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(claims)}&providerId=google.com`,
      requestUri: "http://localhost",
      returnSecureToken: true,
    }),
  });
  expect(response.ok, await response.clone().text()).toBe(true);
  return ((await response.json()) as { idToken: string }).idToken;
}

/** Signs in and returns whether the user had finished onboarding. */
export async function signIn(page: Page, user: TestUser = newUser()): Promise<{ user: TestUser; onboarded: boolean }> {
  const idToken = await emulatorIdToken(user);
  const response = await page.request.post("/api/session", {
    data: { idToken },
    headers: { origin: BASE_URL, "x-forwarded-for": clientAddress() },
  });
  expect(response.status(), await response.text()).toBe(200);
  return { user, onboarded: ((await response.json()) as { onboarded: boolean }).onboarded };
}
