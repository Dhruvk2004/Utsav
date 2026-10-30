import type { Metadata } from "next";
import { WorkspaceTabView } from "@/components/workspace/WorkspaceTabView";

export const metadata: Metadata = { title: "Budget · Event" };

export default function EventBudgetPage() {
  return <WorkspaceTabView />;
}
