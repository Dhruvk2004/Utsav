import { demoUsageSchema } from "@/lib/domain/model/records";
import type { Db } from "./db/types";

/**
 * The public demo's global daily cap on live AI calls (spec 5.10, 9.1): 300 a day. With Firestore
 * configured the count lives in `meta/demoUsage` and is incremented in a transaction, so it holds
 * across instances; without it, each instance counts in memory.
 */

export const DEMO_DAILY_CAP = 300;
export const DEMO_USAGE_PATH = "meta/demoUsage";

export interface DemoQuota {
  /** Counts one live call for `today`; false, without counting, once the day's cap is reached. */
  consume(today: string): Promise<boolean>;
}

export class FirestoreDemoQuota implements DemoQuota {
  constructor(
    private readonly db: Db,
    private readonly cap = DEMO_DAILY_CAP,
  ) {}

  consume(today: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const stored = demoUsageSchema.safeParse(await tx.get(DEMO_USAGE_PATH));
      const used = stored.success && stored.data.day === today ? stored.data.count : 0;
      if (used >= this.cap) return false;
      tx.set(DEMO_USAGE_PATH, { day: today, count: used + 1 });
      return true;
    });
  }
}

export class MemoryDemoQuota implements DemoQuota {
  private usage = { day: "", count: 0 };

  constructor(private readonly cap = DEMO_DAILY_CAP) {}

  async consume(today: string): Promise<boolean> {
    if (this.usage.day !== today) this.usage = { day: today, count: 0 };
    if (this.usage.count >= this.cap) return false;
    this.usage.count += 1;
    return true;
  }
}

export const demoQuotaFor = (db: Db | null): DemoQuota => (db ? new FirestoreDemoQuota(db) : new MemoryDemoQuota());
