import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin, firebaseEmulators, firebaseProjectId, firebaseWebConfig, isSignInConfigured, publicEnv } from "@/lib/config";

const web = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "utsav.example",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "utsav-web",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:2:web:3",
};

describe("firebaseWebConfig", () => {
  it("returns the config when all four values are set", () => {
    expect(firebaseWebConfig(web)).toEqual({ apiKey: "key", authDomain: "utsav.example", projectId: "utsav-web", appId: "1:2:web:3" });
    expect(isSignInConfigured(web)).toBe(true);
  });

  it.each(Object.keys(web))("is null when %s is missing or blank", (key) => {
    expect(firebaseWebConfig({ ...web, [key]: undefined })).toBeNull();
    expect(firebaseWebConfig({ ...web, [key]: "  " })).toBeNull();
    expect(isSignInConfigured({ ...web, [key]: "" })).toBe(false);
  });

  it("reads the inlined NEXT_PUBLIC_* values by default", () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "from-env");
    expect(publicEnv().NEXT_PUBLIC_FIREBASE_API_KEY).toBe("from-env");
    expect(isSignInConfigured()).toBe(false);
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("firebaseProjectId", () => {
  it("prefers FIREBASE_PROJECT_ID, then GOOGLE_CLOUD_PROJECT, then the web config", () => {
    expect(firebaseProjectId({ FIREBASE_PROJECT_ID: "a", GOOGLE_CLOUD_PROJECT: "b", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "c" })).toBe("a");
    expect(firebaseProjectId({ GOOGLE_CLOUD_PROJECT: "b", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "c" })).toBe("b");
    expect(firebaseProjectId({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: "c" })).toBe("c");
    expect(firebaseProjectId({})).toBeNull();
  });
});

describe("firebaseEmulators", () => {
  it("reports the emulator hosts that are set", () => {
    expect(firebaseEmulators({ FIRESTORE_EMULATOR_HOST: "localhost:8080" })).toEqual({ firestore: "localhost:8080", auth: null });
    expect(firebaseEmulators({ FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099" })).toEqual({ firestore: null, auth: "localhost:9099" });
  });
});

describe("appOrigin", () => {
  it("normalises a valid origin", () => {
    expect(appOrigin({ APP_ORIGIN: "https://utsav.example/some/path" })).toBe("https://utsav.example");
    expect(appOrigin({ APP_ORIGIN: "http://localhost:3000" })).toBe("http://localhost:3000");
  });

  it.each([undefined, "", "not a url", "ftp://utsav.example"])("is null for %s", (raw) => {
    expect(appOrigin({ APP_ORIGIN: raw })).toBeNull();
  });
});
