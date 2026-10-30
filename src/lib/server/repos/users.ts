import { applyProfilePatch, userDocSchema, type ProfilePatch, type UserDoc, type UserProfile } from "@/lib/domain/model/user";
import type { Db, Tx } from "../db/types";

/**
 * `users/{uid}` (spec 4.3, 8.2): created on first sign-in from the Google profile, merged with
 * validated patches from onboarding and Settings, and holding the daily AI quota counter.
 */

export const userPath = (uid: string) => `users/${uid}`;

/** What sign-in knows about a new user: name, photo and email from Google. */
export interface Identity {
  displayName: string;
  photoURL: string | null;
  email: string;
}

export function newUserDoc(identity: Identity, today: string, now: string): UserDoc {
  return {
    displayName: identity.displayName.slice(0, 60),
    photoURL: identity.photoURL,
    email: identity.email,
    homeCity: "",
    language: "en",
    role: null,
    eventTypes: [],
    traditions: [],
    traditionOther: "",
    dietary: [],
    budgetStyle: null,
    detailLevel: "everything",
    onboardedAt: null,
    aiUsage: { day: today, count: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

const profileSchema = userDocSchema.omit({ createdAt: true, updatedAt: true });

/** The profile as the app reads it; the timestamps stay on the server. */
export function toProfile(user: UserDoc): UserProfile {
  return profileSchema.parse(user);
}

export class UserRepo {
  constructor(private readonly db: Db) {}

  async get(uid: string): Promise<UserDoc | null> {
    const data = await this.db.get(userPath(uid));
    return data ? userDocSchema.parse(data) : null;
  }

  private async read(tx: Tx, uid: string, identity: Identity, today: string, now: string): Promise<{ user: UserDoc; created: boolean }> {
    const data = await tx.get(userPath(uid));
    return data ? { user: userDocSchema.parse(data), created: false } : { user: newUserDoc(identity, today, now), created: true };
  }

  /** The user's doc, created from their Google identity on first sign-in (spec 12.1 POST /api/session). */
  ensure(uid: string, identity: Identity, today: string, now: string): Promise<UserDoc> {
    return this.db.transaction(async (tx) => {
      const { user, created } = await this.read(tx, uid, identity, today, now);
      if (created) tx.set(userPath(uid), user);
      return user;
    });
  }

  /** Merges a profile patch (spec 4.1 per-step saves); `onboardedAt` is set once and never cleared. */
  savePatch(uid: string, identity: Identity, patch: ProfilePatch, clock: { today: string; now: string }): Promise<UserDoc> {
    return this.db.transaction(async (tx) => {
      const { user } = await this.read(tx, uid, identity, clock.today, clock.now);
      const next: UserDoc = { ...user, ...applyProfilePatch(toProfile(user), patch, clock.now), updatedAt: clock.now };
      tx.set(userPath(uid), next);
      return next;
    });
  }

  /**
   * Counts one AI call against the daily quota (spec 9.3) in a transaction, so the limit is exact
   * across instances. Returns false, without counting, when today's quota is used up.
   */
  consumeAi(uid: string, identity: Identity, quota: number, clock: { today: string; now: string }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const { user } = await this.read(tx, uid, identity, clock.today, clock.now);
      const used = user.aiUsage.day === clock.today ? user.aiUsage.count : 0;
      if (used >= quota) return false;
      tx.set(userPath(uid), { ...user, aiUsage: { day: clock.today, count: used + 1 } });
      return true;
    });
  }

  delete(uid: string): Promise<void> {
    return this.db.deleteTree(userPath(uid));
  }
}
