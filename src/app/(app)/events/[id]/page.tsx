import type { Metadata } from "next";
import { WorkspaceTabView } from "@/components/workspace/WorkspaceTabView";

export const metadata: Metadata = { title: "Overview · Event" };

export default function EventOverviewPage() {
  return <WorkspaceTabView />;
}
