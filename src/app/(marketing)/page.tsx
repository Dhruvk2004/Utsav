import { Landing } from "@/components/landing/Landing";

/** Public landing page, statically rendered. Visitors with a session cookie are sent on by `src/proxy.ts`. */
export default function HomePage() {
  return <Landing />;
}
