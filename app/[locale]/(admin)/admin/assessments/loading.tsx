import { Skeleton, SkeletonTableRows } from "@/components/ui/Skeleton";

// The section's own boundary: it sits inside assessments/layout.tsx, so the
// heading and the sub-nav stay while a tab loads — only the content below
// them is a skeleton (a sub-heading, a line, and a table).
export default function Loading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <SkeletonTableRows rows={4} cols={5} />
    </div>
  );
}
