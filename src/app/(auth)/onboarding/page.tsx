import type { Metadata } from "next";
import { Suspense } from "react";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { Main } from "@/components/shell/Main";

export const metadata: Metadata = { title: "Set up your profile" };

export default function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  return (
    <Main className="rangoli px-4 py-8 sm:py-10">
      {/* Signed-out visitors go to sign-in; onboarded ones to the dashboard unless ?rerun=1 (spec 3.3). */}
      <Suspense>
        <RouteGuard route="onboarding" searchParams={searchParams}>
          <OnboardingWizard />
        </RouteGuard>
      </Suspense>
    </Main>
  );
}
