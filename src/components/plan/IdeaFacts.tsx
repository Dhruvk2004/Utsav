"use client";

import { TriangleAlert } from "lucide-react";
import { Tag } from "@/components/ui/Chip";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { ideaCost, ideaFlags, whyThisIdea } from "@/lib/client/ideasView";
import type { IdeaFields } from "@/lib/domain/model/event";

/** Cost, flags and "Why this idea" for an idea, all built by code (spec 6.5, 7.3). */
export function IdeaFacts({
  idea,
}: {
  idea: Pick<IdeaFields, "title" | "description" | "category" | "estimatedCost" | "costBasis" | "basis">;
}) {
  const { plan } = useWorkspace();
  const cost = ideaCost(idea);
  const why = whyThisIdea(idea, plan);
  return (
    <>
      {cost && <span className="num text-body-sm font-semibold">{cost}</span>}
      {ideaFlags(idea, plan).map((flag) => (
        <Tag key={flag} tone="warning" icon={<TriangleAlert aria-hidden="true" />}>
          {flag}
        </Tag>
      ))}
      {why && <span className="text-body-sm text-fg-muted">{why}</span>}
    </>
  );
}
