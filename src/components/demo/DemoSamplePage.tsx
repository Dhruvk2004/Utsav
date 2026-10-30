import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Main } from "@/components/shell/Main";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { WorkspaceSkeleton } from "@/components/workspace/WorkspaceSkeleton";
import { DEMO_SAMPLES, type DemoSample } from "@/lib/demo/resolveDates";
import { DemoWorkspace } from "./DemoWorkspace";

/** The samples prerendered at build time (`generateStaticParams`). */
export const DEMO_SAMPLE_PARAMS = DEMO_SAMPLES.map((sample) => ({ sample }));

const isSample = (value: string): value is DemoSample => DEMO_SAMPLES.some((sample) => sample === value);

/** `/demo/[sample]`: an unknown sample is a 404; the tab and dates resolve on the client. */
export async function DemoSamplePage({ params }: { params: Promise<{ sample: string }> }) {
  const { sample } = await params;
  if (!isSample(sample)) notFound();
  return (
    <>
      <SiteHeader />
      <Main>
        <Suspense fallback={<WorkspaceSkeleton label="Loading the sample plan" />}>
          <DemoWorkspace sample={sample} />
        </Suspense>
      </Main>
    </>
  );
}
