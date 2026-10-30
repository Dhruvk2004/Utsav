import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";

/** Loading (spec 10.17): header, tab bar and four cards in the final layout's geometry. */
export function WorkspaceSkeleton({ label = "Loading the plan" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="mx-auto grid max-w-[1200px] gap-5 px-4 py-6 sm:px-6">
      <Skeleton className="h-9 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-1/2 max-w-sm" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-lg" />
        ))}
      </div>
    </SkeletonRegion>
  );
}
