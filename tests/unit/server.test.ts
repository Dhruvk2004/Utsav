import { describe, expect, it } from "vitest";
import { stableKey, TtlCache } from "@/lib/server/cache";
import { clientIp, RateLimiter } from "@/lib/server/rateLimit";

describe("TtlCache", () => {
  it("returns stored values until they expire", () => {
    let now = 0;
    const cache = new TtlCache<number>(10, 100, () => now);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    now = 100;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("evicts the least recently used entry when full", () => {
    const cache = new TtlCache<number>(2, 1000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });

  it("overwrites an existing key without growing", () => {
    const cache = new TtlCache<number>(2, 1000);
    cache.set("a", 1);
    cache.set("a", 2);
    expect(cache.size).toBe(1);
    expect(cache.get("a")).toBe(2);
  });
});

describe("stableKey", () => {
  it("ignores object key order but keeps array order", () => {
    expect(stableKey({ a: 1, b: { c: 2, d: 3 } })).toBe(stableKey({ b: { d: 3, c: 2 }, a: 1 }));
    expect(stableKey([1, 2])).not.toBe(stableKey([2, 1]));
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit, then blocks until the window resets", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 60_000, () => now);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(limiter.check("other").allowed).toBe(true);
    now = 60_000;
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("prunes expired windows when many clients have been seen", () => {
    let now = 0;
    const limiter = new RateLimiter(1, 10, () => now);
    for (let i = 0; i < 1001; i++) limiter.check(`c${i}`);
    now = 20;
    expect(limiter.check("fresh").allowed).toBe(true);
    expect(limiter.check("c1").allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the rightmost X-Forwarded-For hop, which Cloud Run appends, and ignores spoofed ones", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
  });

  it("falls back to X-Real-IP, then a shared key", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": " , ", "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("anonymous");
  });
});

describe("TtlCache.delete", () => {
  it("removes one entry", () => {
    const cache = new TtlCache<number>(2, 1000);
    cache.set("a", 1);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
  });
});
