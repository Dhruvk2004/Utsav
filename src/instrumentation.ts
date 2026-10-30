import { assertDeployableEnv } from "@/lib/config";

/** Runs once as a server instance starts (Next.js instrumentation): a deployed server refuses test-only settings (SEC-09). */
export function register(): void {
  assertDeployableEnv(process.env);
}
