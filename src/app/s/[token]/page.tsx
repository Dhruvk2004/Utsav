import type { Metadata } from "next";
import { Suspense } from "react";
import { SharedHeader } from "@/components/share/SharedPlan";
import { SharedPlanPage } from "@/components/share/SharedPlanPage";
import { Main } from "@/components/shell/Main";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { WorkspaceSkeleton } from "@/components/workspace/WorkspaceSkeleton";

export const metadata: Metadata = { title: "Shared plan", robots: { index: false, follow: false } };

/** A read-only shared plan (spec 10.15); the token is runtime data, so the page streams in. */
export default function SharedPage({ params }: PageProps<"/s/[token]">) {
  return (
    <>
      <SharedHeader />
      <Main>
        <Suspense fallback={<WorkspaceSkeleton label="Loading the shared plan" />}>
          <SharedPlanPage params={params} />
        </Suspense>
      </Main>
      <SiteFooter />
    </>
  );
}
