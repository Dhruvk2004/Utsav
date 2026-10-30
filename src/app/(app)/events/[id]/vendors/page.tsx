import type { Metadata } from "next";
import { WorkspaceTabView } from "@/components/workspace/WorkspaceTabView";

export const metadata: Metadata = { title: "Vendors · Event" };

export default function EventVendorsPage() {
  return <WorkspaceTabView />;
}
