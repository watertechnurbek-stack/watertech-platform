import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

// The overview's own boundary: it sits in the (overview) route group so this
// skeleton shows for /admin only — the CMS pages keep the generic list
// skeleton of ../loading.tsx. Sizes follow AdminOverview: header, refresh and
// the three range pills, four StatCards (h-[132px]), the attention list, the
// team table, then the two half-width cards.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Skeleton className="h-9 w-48 max-w-full" />
            <Skeleton className="mt-1 h-5 w-96 max-w-full" />
          </div>
          <Skeleton className="h-8 w-52" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SkeletonCard className="h-[132px]" />
        <SkeletonCard className="h-[132px]" />
        <SkeletonCard className="h-[132px]" />
        <SkeletonCard className="h-[132px]" />
      </div>

      <SkeletonCard className="h-72" />
      <SkeletonCard className="h-[26rem]" />

      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard className="h-96" />
        <SkeletonCard className="h-96" />
      </div>
    </div>
  );
}
