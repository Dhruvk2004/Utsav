import type { Metadata } from "next";
import { WorkspaceTabView } from "@/components/workspace/WorkspaceTabView";

export const metadata: Metadata = { title: "Timeline · Event" };

export default function EventTimelinePage() {
  return <WorkspaceTabView />;
}
