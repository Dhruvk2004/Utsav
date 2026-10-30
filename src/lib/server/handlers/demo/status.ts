import { connection } from "next/server";
import type { ServerDeps } from "../../deps";
import { json, notFound } from "../../http";
import { runtime } from "../../runtime";
import { sampleOf } from "./sandbox";

/**
 * `GET /api/demo/[sample]/ai` (public, spec 5.10): whether this deployment has live AI, so the demo
 * offers only its recorded examples when it has none (MQR-03). It says nothing else about the model.
 */
export async function demoAiStatus(deps: ServerDeps, params: Promise<{ sample: string }>): Promise<Response> {
  if (!sampleOf((await params).sample)) return notFound();
  return json({ live: deps.model !== null });
}

export async function GET(_request: Request, context: { params: Promise<{ sample: string }> }) {
  // Read at request time: the model is configured on the server at runtime, never at build time.
  await connection();
  return demoAiStatus(runtime(), context.params);
}
