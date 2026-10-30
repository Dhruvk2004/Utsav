import type { Metadata } from "next";
import { DEMO_SAMPLE_PARAMS, DemoSamplePage } from "@/components/demo/DemoSamplePage";

export const metadata: Metadata = { title: "Sample plan" };

export function generateStaticParams() {
  return DEMO_SAMPLE_PARAMS;
}

/** A public sample plan with sandboxed AI (spec 5.10); ?tab= picks the view on the client. */
export default function SamplePage({ params }: PageProps<"/demo/[sample]">) {
  return <DemoSamplePage params={params} />;
}
