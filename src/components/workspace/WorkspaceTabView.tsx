"use client";

import { createContext, useContext } from "react";
import { ReviewBanner } from "@/components/plan/ReviewBanner";
import { reviewPending } from "@/lib/client/review";
import { BudgetTab } from "./tabs/BudgetTab";
import { GuestsTab } from "./tabs/GuestsTab";
import { IdeasTab } from "./tabs/IdeasTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { TimelineTab } from "./tabs/TimelineTab";
import { VendorsTab } from "./tabs/VendorsTab";
import { useWorkspace } from "./WorkspaceContext";

/** Whether the "Review your new plan" banner was dismissed; the event menu can bring it back (spec 6.2). */
export const ReviewVisibility = createContext<{ dismissed: boolean; setDismissed: (dismissed: boolean) => void } | null>(null);

function ReviewSlot() {
  const { plan, workspace } = useWorkspace();
  const visibility = useContext(ReviewVisibility);
  if (!visibility || visibility.dismissed || !workspace.review || !reviewPending(plan)) return null;
  return <ReviewBanner onDismiss={() => visibility.setDismissed(true)} />;
}

/** The current tab's content, entering with the M4 fade. */
export function WorkspaceTabView() {
  const { tab } = useWorkspace();
  return (
    <div key={tab} className="motion-fade-up">
      {tab === "overview" && <OverviewTab banner={<ReviewSlot />} />}
      {tab === "budget" && <BudgetTab />}
      {tab === "timeline" && <TimelineTab />}
      {tab === "vendors" && <VendorsTab />}
      {tab === "ideas" && <IdeasTab />}
      {tab === "guests" && <GuestsTab />}
    </div>
  );
}
