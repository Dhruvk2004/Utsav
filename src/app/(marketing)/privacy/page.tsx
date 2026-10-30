import type { Metadata } from "next";
import { PrivacyContent } from "@/components/privacy/PrivacyContent";
import { Main } from "@/components/shell/Main";
import { SiteHeader } from "@/components/shell/SiteHeader";

export const metadata: Metadata = { title: "Privacy and AI" };

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <Main>
        <PrivacyContent />
      </Main>
    </>
  );
}
