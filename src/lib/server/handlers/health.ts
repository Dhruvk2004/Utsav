import { connection } from "next/server";
import type { HealthReport, ServerDeps } from "../deps";
import { json } from "../http";
import { runtime } from "../runtime";

/**
 * `GET /api/health` (spec 9.6): liveness plus a Firestore ping and model reachability, cached for
 * 60 s so probes cost nothing. It reports the model id and location, never keys or project ids.
 */

const HEALTH_KEY = "health";

async function firestoreStatus(deps: ServerDeps): Promise<HealthReport["firestore"]> {
  if (!deps.db) return "not_configured";
  try {
    await deps.db.get("meta/health");
    return "ok";
  } catch {
    return "error";
  }
}

export async function health(deps: ServerDeps): Promise<Response> {
  let report = deps.caches.health.get(HEALTH_KEY);
  if (!report) {
    const [firestore, reachable] = await Promise.all([firestoreStatus(deps), deps.probe.reachable()]);
    report = { status: "ok", firestore, model: { id: deps.probe.id, location: deps.probe.location, reachable } };
    deps.caches.health.set(HEALTH_KEY, report);
  }
  return json(report);
}

export async function GET() {
  // A live probe: never prerendered at build time.
  await connection();
  return health(runtime());
}
