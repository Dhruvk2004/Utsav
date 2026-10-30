/** Why a Google sign-in did not finish (spec 10.2: cancelled, popup blocked, network). */
export type SignInFailure = "cancelled" | "popup_blocked" | "network";

export type SignInResult = { ok: true; onboarded: boolean } | { ok: false; reason: SignInFailure };

/**
 * Google sign-in as the UI sees it. `FirebaseAuthClient` implements it with the Firebase web SDK
 * (popup first, redirect when the popup is blocked) and the `/api/session` cookie.
 */
export interface AuthClient {
  /** Warms up sign-in on the sign-in page, so the popup opens straight from the click. */
  preload(): void;
  signIn(): Promise<SignInResult>;
  /** Continues in this tab when the browser blocked the popup. */
  signInWithRedirect(): Promise<void>;
  /** Finishes a redirect sign-in when the page loads after it; null when none was started. */
  completeRedirect(): Promise<SignInResult | null>;
  signOut(): Promise<void>;
}
