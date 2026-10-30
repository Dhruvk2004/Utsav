import { applicationDefault, cert, getApps, initializeApp, type Credential } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, initializeFirestore } from "firebase-admin/firestore";
import { firebaseEmulators } from "@/lib/config";
import type { SessionAuth } from "../auth/session";
import type { Db } from "../db/types";
import { firestoreDb } from "./firestoreDb";

/**
 * Firebase Admin SDK, initialised lazily once per server instance (credentials: see
 * `adminCredential`). The SDK itself honours FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST.
 */
export function adminServices(projectId: string, env: Record<string, string | undefined> = process.env): { auth: SessionAuth; db: Db } {
  // Development reloads re-run modules but keep the initialised app.
  const existing = getApps()[0];
  if (existing) return { auth: getAuth(existing), db: firestoreDb(getFirestore(existing)) };
  const app = initializeApp({ credential: adminCredential(env), projectId });
  const firestore = initializeFirestore(app, firestoreSettings(env));
  return { auth: getAuth(app), db: firestoreDb(firestore) };
}

/**
 * The service-account key from FIREBASE_SERVICE_ACCOUNT (its JSON, or that JSON base64-encoded) on
 * hosts without Google credentials such as Vercel; otherwise Application Default Credentials (the
 * Cloud Run service account, or locally GOOGLE_APPLICATION_CREDENTIALS). Errors never echo the key.
 */
export function adminCredential(env: Record<string, string | undefined>): Credential {
  const raw = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return applicationDefault();
  let key: unknown;
  try {
    key = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not a service-account JSON key (or its base64)");
  }
  const { project_id, client_email, private_key } = (key ?? {}) as Record<string, unknown>;
  if (typeof client_email !== "string" || typeof private_key !== "string") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing client_email or private_key");
  }
  return cert({ projectId: typeof project_id === "string" ? project_id : undefined, clientEmail: client_email, privateKey: private_key });
}

/**
 * REST keeps cold starts small on serverless hosts. Against the emulator the SDK must use gRPC: over REST
 * it still asks for Application Default Credentials, which a local run does not have (QA-08).
 */
export function firestoreSettings(env: Record<string, string | undefined>): { preferRest: boolean } {
  return { preferRest: firebaseEmulators(env).firestore === null };
}
