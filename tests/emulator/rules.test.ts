import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

/**
 * firestore.rules (spec 8.3): every client read and write is denied, signed in or not, for the
 * owner too. The app reads and writes only through its route handlers with the Admin SDK.
 */

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:3480").split(":");
const OWNER = "owner-uid";

let env: RulesTestEnvironment;

const PATHS = [
  `users/${OWNER}`,
  "events/e1",
  "events/e1/history/h1",
  "events/e1/proposals/p1",
  "events/e1/private/share",
  "shares/abc123",
  "meta/demoUsage",
  "anything/else",
];

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-utsav-rules",
    firestore: { host, port: Number(port), rules: readFileSync("firestore.rules", "utf8") },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const path of PATHS) await setDoc(doc(db, path), { ownerUid: OWNER, seeded: true });
  });
});

afterAll(async () => {
  await env.clearFirestore();
  await env.cleanup();
});

const clients = () =>
  [
    ["signed out", env.unauthenticatedContext().firestore()],
    ["the owner", env.authenticatedContext(OWNER).firestore()],
    ["another user", env.authenticatedContext("someone-else").firestore()],
  ] as const;

describe("firestore.rules: clients are denied everything", () => {
  it("the seed exists, so the denials below are the rules and not missing documents", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await assertSucceeds(getDoc(doc(context.firestore(), "events/e1")));
    });
  });

  for (const path of PATHS) {
    it(`denies get, set, update and delete on ${path}`, async () => {
      for (const [, db] of clients()) {
        await assertFails(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path), { ownerUid: OWNER }));
        await assertFails(updateDoc(doc(db, path), { seeded: false }));
        await assertFails(deleteDoc(doc(db, path)));
      }
    });
  }

  it("denies listing every collection, including the owner's own events", async () => {
    for (const [, db] of clients()) {
      for (const name of ["users", "events", "events/e1/history", "events/e1/proposals", "shares", "meta"])
        await assertFails(getDocs(collection(db, name)));
    }
  });

  it("denies creating new documents anywhere", async () => {
    for (const [, db] of clients()) {
      await assertFails(setDoc(doc(db, "events/new-event"), { ownerUid: OWNER }));
      await assertFails(setDoc(doc(db, `users/${OWNER}/private/x`), { a: 1 }));
    }
  });
});
