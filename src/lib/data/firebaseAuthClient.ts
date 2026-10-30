import { z } from "zod";
import { Api } from "./api";
import type { AuthClient, SignInFailure, SignInResult } from "./authClient";

/**
 * Google sign-in (spec 9.1): the popup first on every browser, the redirect only when the popup is
 * blocked. The Google ID token is exchanged for the httpOnly session cookie at `/api/session`, and
 * the Firebase web SDK is signed out straight away: the cookie is the only session.
 */

/** The Firebase web SDK calls, loaded on demand so other pages never download the SDK (spec 9.3). */
export interface GoogleSignIn {
  /** Signs in with a popup and returns the ID token. */
  popup(): Promise<string>;
  redirect(): Promise<void>;
  /** The ID token after a redirect sign-in, or null when there was none. */
  redirectResult(): Promise<string | null>;
  signOut(): Promise<void>;
}

/** Remembers, for this tab, that a redirect sign-in is under way. */
export const REDIRECT_FLAG = "utsav:sign-in-redirect";

const CANCELLED = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);

/** The UI's failure reason for a Firebase error code (spec 10.2). */
export function signInFailure(error: unknown): SignInFailure {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "auth/popup-blocked") return "popup_blocked";
  return CANCELLED.has(code) ? "cancelled" : "network";
}

const sessionSchema = z.object({ onboarded: z.boolean() });

export class FirebaseAuthClient implements AuthClient {
  private loading: Promise<GoogleSignIn> | null = null;

  constructor(
    private readonly loadSdk: () => Promise<GoogleSignIn>,
    private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
    private readonly api = new Api(),
  ) {}

  /** Starts loading the SDK early, so the click opens the popup without waiting (popup blockers). */
  preload(): void {
    void this.load().catch(() => undefined);
  }

  private load(): Promise<GoogleSignIn> {
    this.loading ??= this.loadSdk().catch((error: unknown) => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  async signIn(): Promise<SignInResult> {
    try {
      const google = await this.load();
      return await this.exchange(google, await google.popup());
    } catch (error) {
      return { ok: false, reason: signInFailure(error) };
    }
  }

  async signInWithRedirect(): Promise<void> {
    const google = await this.load();
    this.storage.setItem(REDIRECT_FLAG, "1");
    await google.redirect();
  }

  async completeRedirect(): Promise<SignInResult | null> {
    if (this.storage.getItem(REDIRECT_FLAG) === null) return null;
    this.storage.removeItem(REDIRECT_FLAG);
    try {
      const google = await this.load();
      const idToken = await google.redirectResult();
      return idToken ? await this.exchange(google, idToken) : null;
    } catch (error) {
      return { ok: false, reason: signInFailure(error) };
    }
  }

  async signOut(): Promise<void> {
    await this.api.request("/api/session", z.undefined(), { method: "DELETE" });
  }

  private async exchange(google: GoogleSignIn, idToken: string): Promise<SignInResult> {
    const { onboarded } = await this.api.request("/api/session", sessionSchema, { method: "POST", body: { idToken } });
    await google.signOut();
    return { ok: true, onboarded };
  }
}
