import { TtlCache } from "../cache";

/**
 * Session verification (spec 9.1, R2-08). Reads verify the cookie locally (signature and expiry
 * with cached Google keys, no network call). Writes also check revocation: the cookie's
 * `auth_time` against the user's `tokensValidAfterTime`, which is what `checkRevoked=true` does,
 * cached per uid for 60 s so an edit burst costs at most one Firebase Auth call a minute.
 */

export type SessionKind = "read" | "write";

export const REVOCATION_TTL_MS = 60_000;

/** The claims Utsav reads from a verified ID token or session cookie. */
export interface SessionClaims {
  uid: string;
  /** Seconds since the epoch when the user signed in. */
  auth_time: number;
  email?: string;
  name?: string;
  picture?: string;
}

/** The Firebase Admin Auth calls Utsav makes, so tests can supply a fake. */
export interface SessionAuth {
  verifyIdToken(idToken: string): Promise<SessionClaims>;
  createSessionCookie(idToken: string, options: { expiresIn: number }): Promise<string>;
  verifySessionCookie(cookie: string, checkRevoked: boolean): Promise<SessionClaims>;
  getUser(uid: string): Promise<{ tokensValidAfterTime?: string }>;
  revokeRefreshTokens(uid: string): Promise<void>;
  deleteUser(uid: string): Promise<void>;
}

export interface Session {
  uid: string;
  email: string;
  name: string;
  picture: string | null;
}

export function sessionFromClaims(claims: SessionClaims): Session {
  return { uid: claims.uid, email: claims.email ?? "", name: claims.name ?? "", picture: claims.picture ?? null };
}

export class SessionVerifier {
  private readonly validAfter: TtlCache<number>;

  constructor(
    private readonly auth: SessionAuth,
    clock: () => number = Date.now,
  ) {
    this.validAfter = new TtlCache<number>(5_000, REVOCATION_TTL_MS, clock);
  }

  /** The session for a cookie, or null when it is missing, invalid, expired or (for writes) revoked. */
  async verify(cookie: string | null, kind: SessionKind): Promise<Session | null> {
    if (!cookie) return null;
    let claims: SessionClaims;
    try {
      claims = await this.auth.verifySessionCookie(cookie, false);
    } catch {
      return null;
    }
    if (kind === "write" && (await this.isRevoked(claims))) return null;
    return sessionFromClaims(claims);
  }

  /** Drops the cached revocation time, so this instance re-checks on the next write (sign-out). */
  forget(uid: string): void {
    this.validAfter.delete(uid);
  }

  private async isRevoked(claims: SessionClaims): Promise<boolean> {
    let after = this.validAfter.get(claims.uid);
    if (after === undefined) {
      try {
        const user = await this.auth.getUser(claims.uid);
        after = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : 0;
      } catch {
        // The account no longer exists.
        after = Number.POSITIVE_INFINITY;
      }
      this.validAfter.set(claims.uid, after);
    }
    return claims.auth_time * 1000 < after;
  }
}
