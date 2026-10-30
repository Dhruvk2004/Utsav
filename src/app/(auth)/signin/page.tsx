import type { Metadata } from "next";
import { Suspense } from "react";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { SignInCard } from "@/components/auth/SignInCard";
import { Main } from "@/components/shell/Main";
import { isSignInConfigured } from "@/lib/config";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/signin">) {
  return (
    <Main className="rangoli grid place-items-center px-4 py-10">
      {/* Signed-in visitors go on to onboarding or ?next= (spec 3.3); the card reads ?next= too. */}
      <Suspense>
        <RouteGuard route="signin" searchParams={searchParams}>
          <SignInCard configured={isSignInConfigured()} />
        </RouteGuard>
      </Suspense>
    </Main>
  );
}
