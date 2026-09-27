import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

// The knowledge page's own skeleton — the admin layout's generic one is a
// heading and a table. Sizes follow page.tsx: heading, the range pills and the
// person filter, the gaps card, the feedback and Copilot cards side by side,
// the content-health card, then the most-used table.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-4">
        <div className="min-w-0">
          <Skeleton className="h-9 w-56 max-w-full" />
          <Skeleton className="mt-1 h-5 w-96 max-w-full" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="h-8 w-64 max-w-full" />
        </div>
      </div>

      <SkeletonCard className="h-96" />

      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard className="h-72" />
        <SkeletonCard className="h-72" />
      </div>

      <SkeletonCard className="h-80" />
      <SkeletonCard className="h-96" />
    </div>
  );
}
