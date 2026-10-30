import type { ProfilePatch, UserProfile } from "@/lib/domain/model/user";

/**
 * How the UI reads and saves the signed-in user's profile: `HttpProfileStore` over
 * `GET/PUT /api/profile` in the app, an in-memory store in tests.
 */
export interface ProfileStore {
  load(signal?: AbortSignal): Promise<UserProfile>;
  /** Merges a partial patch (one onboarding step, or the Settings form) and returns the saved profile. */
  save(patch: ProfilePatch, signal?: AbortSignal): Promise<UserProfile>;
}
