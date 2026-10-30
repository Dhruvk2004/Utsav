// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { decodeTimestamps, encodeTimestamps, type TimestampCodec } from "@/lib/server/db/timestamps";
import { errorResponse, isSameOrigin, json, noContent, rateLimited, readJson } from "@/lib/server/http";
import { hashShareToken, newShareToken, shareUrl } from "@/lib/server/shareTokens";

const schema = z.strictObject({ name: z.string().min(1, "Add a name.") });
const post = (body: string, type = "application/json") =>
  new Request("https://utsav.test/api/x", { method: "POST", headers: { "content-type": type }, body });

describe("readJson", () => {
  it("parses a valid JSON body", async () => {
    expect(await readJson(post('{"name":"Asha"}'), schema)).toEqual({ ok: true, data: { name: "Asha" } });
  });

  it.each([
    ["a non-JSON content type", post("{}", "text/plain"), 415],
    ["an oversized body", post(JSON.stringify({ name: "x".repeat(200) })), 413],
    ["malformed JSON", post("{"), 400],
  ])("rejects %s", async (_, request, status) => {
    const result = await readJson(request, schema, 100);
    expect(!result.ok && result.response.status).toBe(status);
  });

  it("returns field errors keyed by path", async () => {
    const result = await readJson(post('{"name":""}'), schema);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(await result.response.json()).toEqual({
        error: { code: "invalid_input", message: "Some details need fixing.", fields: { name: "Add a name." } },
      });
    const extra = await readJson(post('{"name":"a","origin":"ai"}'), schema);
    if (!extra.ok)
      expect(((await extra.response.json()) as { error: { fields: Record<string, string> } }).error.fields).toHaveProperty("form");
  });
});

describe("responses", () => {
  it("are never cached, and errors use the ApiError shape plus extra fields", async () => {
    expect(json({ a: 1 }).headers.get("cache-control")).toBe("private, no-store");
    expect(noContent().status).toBe(204);
    const error = errorResponse(409, "version_conflict", "Changed.", { event: { version: 2 } });
    expect(await error.json()).toEqual({ error: { code: "version_conflict", message: "Changed." }, event: { version: 2 } });
    const limited = rateLimited(30, "Slow down.");
    expect(limited.headers.get("retry-after")).toBe("30");
    expect(await limited.json()).toMatchObject({ retryAfterSeconds: 30 });
  });
});

describe("isSameOrigin", () => {
  const withOrigin = (origin?: string) => new Request("https://utsav.test/api/x", { headers: origin ? { origin } : {} });
  it("matches the configured origin exactly, else the request's own", () => {
    expect(isSameOrigin(withOrigin("https://utsav.app"), "https://utsav.app")).toBe(true);
    expect(isSameOrigin(withOrigin("https://utsav.app.evil"), "https://utsav.app")).toBe(false);
    expect(isSameOrigin(withOrigin(), "https://utsav.app")).toBe(false);
    expect(isSameOrigin(withOrigin("https://utsav.test"), null)).toBe(true);
  });
});

describe("timestamps", () => {
  class Stamp {
    constructor(readonly iso: string) {}
  }
  const codec: TimestampCodec<Stamp> = {
    fromIso: (iso) => new Stamp(iso),
    isTimestamp: (v): v is Stamp => v instanceof Stamp,
    toIso: (s) => s.iso,
  };

  it("converts timestamp fields by name at any depth, drops undefined fields, and round-trips", () => {
    const doc = {
      createdAt: "2026-10-28T06:00:00.000Z",
      note: "2026-10-28T06:00:00.000Z",
      vendors: [{ history: [{ at: "2026-10-27T06:00:00.000Z" }] }],
      reason: undefined,
      onboardedAt: null,
    };
    const encoded = encodeTimestamps(doc, codec) as Record<string, unknown>;
    expect(encoded.createdAt).toBeInstanceOf(Stamp);
    expect(encoded.note).toBe("2026-10-28T06:00:00.000Z");
    expect(encoded).not.toHaveProperty("reason");
    expect(encoded.onboardedAt).toBeNull();
    const { reason: _dropped, ...expected } = doc;
    void _dropped;
    expect(decodeTimestamps(encoded, codec)).toEqual(expected);
  });
});

describe("share tokens", () => {
  it("are 43 base64url characters, stored only as their SHA-256", () => {
    const token = newShareToken(new Uint8Array(32).fill(7));
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashShareToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(token)).not.toContain(token);
    expect(shareUrl("https://utsav.app", token)).toBe(`https://utsav.app/s/${token}`);
  });
});
