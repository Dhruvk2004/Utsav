// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { adminCredential } from "@/lib/server/firebase/admin";

const key = {
  type: "service_account",
  project_id: "utsav-test",
  client_email: "app@utsav-test.iam.gserviceaccount.com",
  // A throwaway key made for this test; firebase-admin parses the PEM.
  private_key: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

describe("adminCredential", () => {
  it("uses Application Default Credentials when no key is set", () => {
    expect(adminCredential({}).constructor.name).not.toBe("ServiceAccountCredential");
    expect(adminCredential({ FIREBASE_SERVICE_ACCOUNT: "  " }).constructor.name).not.toBe("ServiceAccountCredential");
  });

  it("reads the service-account key from its JSON", () => {
    const credential = adminCredential({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify(key) });
    expect(credential).toMatchObject({ projectId: "utsav-test", clientEmail: key.client_email });
  });

  it("reads the same key base64-encoded", () => {
    const encoded = Buffer.from(JSON.stringify(key)).toString("base64");
    expect(adminCredential({ FIREBASE_SERVICE_ACCOUNT: encoded })).toMatchObject({ clientEmail: key.client_email });
  });

  it("rejects a value that is not a key, without echoing it", () => {
    expect(() => adminCredential({ FIREBASE_SERVICE_ACCOUNT: "{secret-ish" })).toThrow(/not a service-account JSON key/);
    expect(() => adminCredential({ FIREBASE_SERVICE_ACCOUNT: "{secret-ish" })).not.toThrow(/secret-ish/);
    expect(() => adminCredential({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "x" }) })).toThrow(/client_email or private_key/);
    expect(() => adminCredential({ FIREBASE_SERVICE_ACCOUNT: "bnVsbA==" })).toThrow(/client_email or private_key/);
  });
});
