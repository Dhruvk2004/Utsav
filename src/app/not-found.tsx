import type { Metadata } from "next";
import { Main } from "@/components/shell/Main";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { NotFound } from "@/components/system/NotFound";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFoundPage() {
  return (
    <>
      <SiteHeader minimal />
      <Main>
        <NotFound />
      </Main>
      <SiteFooter />
    </>
  );
}
