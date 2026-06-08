import { DecisionsListSkeleton } from '@/components/Skeletons';

export default function DecisionsLoading() {
  return (
    <div className="flex flex-1 flex-col p-8 max-w-4xl mx-auto w-full space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded bg-zinc-800 animate-pulse" />
          <div className="h-4 w-48 rounded bg-zinc-800/70 animate-pulse" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-zinc-800 animate-pulse" />
      </div>
      {/* Filter tabs skeleton */}
      <div className="h-9 w-full rounded-lg bg-zinc-900 animate-pulse" />
      {/* List skeleton */}
      <DecisionsListSkeleton />
    </div>
  );
}
