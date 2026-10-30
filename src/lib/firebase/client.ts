import type { FirebaseWebConfig } from "@/lib/config";
import type { GoogleSignIn } from "@/lib/data/firebaseAuthClient";

/**
 * The Firebase web SDK, imported only when someone signs in (spec 9.3). `authDomain` is the app's
 * own host: `/__/auth/*` is proxied same-origin, so sign-in works where third-party storage is
 * blocked (spec 9.1). The SDK is signed out right after the cookie exchange: the server's session
 * cookie is the only session.
 */
export async function loadGoogleSignIn(config: FirebaseWebConfig): Promise<GoogleSignIn> {
  const [{ getApps, initializeApp }, sdk] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
  const app = getApps()[0] ?? initializeApp(config);
  const auth = sdk.getAuth(app);
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return {
    popup: async () => (await sdk.signInWithPopup(auth, provider)).user.getIdToken(),
    redirect: () => sdk.signInWithRedirect(auth, provider),
    redirectResult: async () => {
      const result = await sdk.getRedirectResult(auth);
      return result ? result.user.getIdToken() : null;
    },
    signOut: () => sdk.signOut(auth),
  };
}
