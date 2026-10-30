import { z } from "zod";
import { clearedSessionCookieHeader, secureCookies } from "../auth/cookies";
import { authorize } from "../auth/guard";
import type { ServerDeps } from "../deps";
import { noContent, readJson } from "../http";
import { EventRepo } from "../repos/events";
import { UserRepo } from "../repos/users";
import { runtime } from "../runtime";

/**
 * `DELETE /api/account` (spec 9.1, F-20): deletes every owned event with its history, proposals
 * and share docs, the profile, and the Firebase Auth user, then clears the session cookie.
 */

const confirmSchema = z.strictObject({ confirm: z.literal("DELETE") });

export async function deleteAccount(request: Request, deps: ServerDeps): Promise<Response> {
  const auth = await authorize(request, deps, "write");
  if (!auth.ok) return auth.response;
  const body = await readJson(request, confirmSchema);
  if (!body.ok) return body.response;
  const { uid } = auth.session;
  const events = new EventRepo(auth.db);
  // Shared links stop at once, as on event delete: the 60 s share cache is evicted too (SEC-04).
  for (const id of await events.ownedIds(uid)) {
    for (const tokenHash of await events.delete(id)) deps.caches.shares.delete(tokenHash);
  }
  await new UserRepo(auth.db).delete(uid);
  // The Auth user may already be gone (a retried request); the data above is what matters.
  await deps.auth?.deleteUser(uid).catch(() => undefined);
  deps.sessions?.forget(uid);
  deps.log("account_deleted", { uid });
  return noContent({ "Set-Cookie": clearedSessionCookieHeader(secureCookies(deps.appOrigin)) });
}

export const DELETE = (request: Request) => deleteAccount(request, runtime());
