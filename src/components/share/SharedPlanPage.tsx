import { notFound } from "next/navigation";
import { loadSharedPlan } from "@/lib/server/loaders/share";
import { SharedPlanView } from "./SharedPlan";

/** `/s/[token]` (spec 10.15): the owner's read-only projection, or a 404 for a bad, unknown or revoked token. */
export async function SharedPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadSharedPlan(token);
  if (result.kind === "rate_limited") throw new Error("Too many requests for shared plans. Try again in a minute.");
  if (result.kind === "not_found") notFound();
  return <SharedPlanView view={result.view} />;
}
