import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Main } from "@/components/shell/Main";
import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";
import type { GuardedRoute } from "@/lib/guards";
import { guardTarget, type SearchParams } from "@/lib/server/loaders/viewer";

/**
 * The server-side route guard (spec 3.3): verifies the session cookie and the profile's onboarding
 * state, then redirects or renders the page. It streams behind a Suspense boundary, because it
 * reads the request (Cache Components).
 */
export async function RouteGuard({
  route,
  searchParams,
  children,
}: {
  route: GuardedRoute;
  searchParams?: SearchParams;
  children: ReactNode;
}) {
  const target = await guardTarget(route, searchParams);
  if (target) redirect(target);
  return children;
}

/** What shows while the guard checks the session: the page column's first lines. */
export function GuardFallback() {
  return (
    <Main>
      <SkeletonRegion label="Loading" className="mx-auto grid max-w-[1200px] gap-4 px-4 py-7 sm:px-6">
        <Skeleton className="h-9 w-1/2 max-w-sm" />
        <Skeleton className="h-4 w-2/3 max-w-md" />
        <Skeleton className="h-40 rounded-lg" />
      </SkeletonRegion>
    </Main>
  );
}
