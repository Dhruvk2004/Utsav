/**
 * Fixed-window rate limiter keyed by client. In-memory, so it is per instance:
 * enough to stop one browser from draining the AI quota.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly clock: () => number = Date.now,
  ) {}

  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = this.clock();
    const current = this.windows.get(key);
    if (!current || current.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      this.prune(now);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (current.count >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
    }
    current.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private prune(now: number): void {
    if (this.windows.size < 1000) return;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

/**
 * Client IP for per-IP limits (spec 9.1). Cloud Run's front end appends the address it saw, and
 * Vercel's replaces the header with it, so the rightmost X-Forwarded-For entry is the trustworthy one;
 * entries to its left are client-supplied.
 * This holds only behind such a proxy: a server reached directly lets the client choose its own key,
 * so the app must never be exposed without one (README "Deploy", QA-15).
 */
export function clientIp(headers: Headers): string {
  const hops =
    headers
      .get("x-forwarded-for")
      ?.split(",")
      .map((hop) => hop.trim())
      .filter(Boolean) ?? [];
  return hops.at(-1) || headers.get("x-real-ip") || "anonymous";
}
