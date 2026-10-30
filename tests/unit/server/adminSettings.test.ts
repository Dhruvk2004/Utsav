// @vitest-environment node
import { describe, expect, it } from "vitest";
import { firestoreSettings } from "@/lib/server/firebase/admin";

describe("firestoreSettings", () => {
  it("uses REST in production for small cold starts", () => {
    expect(firestoreSettings({})).toEqual({ preferRest: true });
  });

  it("uses gRPC against the emulator, where REST would still ask for credentials (QA-08 regression)", () => {
    expect(firestoreSettings({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:3480" })).toEqual({ preferRest: false });
    expect(firestoreSettings({ FIRESTORE_EMULATOR_HOST: " " })).toEqual({ preferRest: true });
  });
});
