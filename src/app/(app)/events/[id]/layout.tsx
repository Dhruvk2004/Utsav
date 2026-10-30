import { Suspense } from "react";
import { Main } from "@/components/shell/Main";
import { EventWorkspace } from "@/components/workspace/EventWorkspace";
import { WorkspaceSkeleton } from "@/components/workspace/WorkspaceSkeleton";

/** The event workspace around every tab route (spec 3.1); the event id is runtime data, so it streams in. */
export default function EventLayout({ children, params }: LayoutProps<"/events/[id]">) {
  return (
    <Main>
      <Suspense fallback={<WorkspaceSkeleton />}>
        <EventWorkspace params={params}>{children}</EventWorkspace>
      </Suspense>
    </Main>
  );
}
