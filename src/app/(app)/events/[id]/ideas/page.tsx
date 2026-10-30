import type { Metadata } from "next";
import { WorkspaceTabView } from "@/components/workspace/WorkspaceTabView";

export const metadata: Metadata = { title: "Ideas · Event" };

export default function EventIdeasPage() {
  return <WorkspaceTabView />;
}
