import { Suspense } from "react";
import { ServicesProvider } from "@/components/data/ServicesProvider";
import { GuardFallback, RouteGuard } from "@/components/auth/RouteGuard";
import { AppHeader, AppHeaderBar } from "@/components/shell/AppHeader";
import { SiteFooter } from "@/components/shell/SiteFooter";

/**
 * Signed-in pages: the server guard (spec 3.3) verifies the session before any page renders. The data
 * services live here and in the (auth) layout only, so public pages never download them.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ServicesProvider>
      <Suspense fallback={<AppHeaderBar onEvents={false} />}>
        <AppHeader />
      </Suspense>
      <Suspense fallback={<GuardFallback />}>
        <RouteGuard route="app">{children}</RouteGuard>
      </Suspense>
      <SiteFooter />
    </ServicesProvider>
  );
}
