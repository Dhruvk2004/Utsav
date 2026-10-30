import type { Metadata } from "next";
import { SettingsPage as Settings } from "@/components/profile/SettingsPage";
import { Main } from "@/components/shell/Main";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Main>
      <Settings />
    </Main>
  );
}
