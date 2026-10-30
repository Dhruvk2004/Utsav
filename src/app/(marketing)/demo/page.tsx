import type { Metadata } from "next";
import { DemoChooser } from "@/components/demo/DemoChooser";
import { Main } from "@/components/shell/Main";
import { SiteHeader } from "@/components/shell/SiteHeader";

export const metadata: Metadata = { title: "Sample plans" };

/** Public demo chooser (spec 5.10), statically rendered. */
export default function DemoPage() {
  return (
    <>
      <SiteHeader />
      <Main>
        <DemoChooser />
      </Main>
    </>
  );
}
