import type { Metadata } from "next";
import { WorkspaceTabView } from "@/components/workspace/WorkspaceTabView";

export const metadata: Metadata = { title: "Guests · Event" };

export default function EventGuestsPage() {
  return <WorkspaceTabView />;
}
