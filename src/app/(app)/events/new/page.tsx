import type { Metadata } from "next";
import { Suspense } from "react";
import { NewEventWizard } from "@/components/events/NewEventWizard";
import { Main } from "@/components/shell/Main";

export const metadata: Metadata = { title: "New event" };

export default function NewEventPage() {
  return (
    <Main>
      {/* The wizard keeps its step in ?step= and reads ?type= prefills on the client. */}
      <Suspense>
        <NewEventWizard />
      </Suspense>
    </Main>
  );
}
