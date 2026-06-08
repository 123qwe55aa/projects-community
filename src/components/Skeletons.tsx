// Skeleton / shimmer building blocks for loading states

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg border border-zinc-800 bg-zinc-900 ${className}`}
    />
  );
}

export function SkeletonText({ width = 'full', className = '' }: { width?: string; className?: string }) {
  const widthClass = width === 'full' ? 'w-full' : `w-${width}`;
  return (
    <div className={`animate-pulse h-3 rounded bg-zinc-800 ${widthClass} ${className}`} />
  );
}

/** A full project card skeleton */
export function ProjectCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="h-4 w-2/3 rounded bg-zinc-800" />
        <div className="h-4 w-16 rounded-full bg-zinc-800" />
      </div>
      <div className="h-3 w-full rounded bg-zinc-800/70" />
      <div className="h-3 w-4/5 rounded bg-zinc-800/70" />
      <div className="flex gap-3">
        <div className="h-3 w-16 rounded bg-zinc-800" />
        <div className="h-3 w-20 rounded bg-zinc-800" />
      </div>
    </div>
  );
}

/** A full decision row skeleton */
export function DecisionRowSkeleton() {
  return (
    <div className="animate-pulse flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-4 gap-3">
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-3/4 rounded bg-zinc-800" />
        <div className="h-3 w-1/3 rounded bg-zinc-800/70" />
      </div>
      <div className="flex gap-2 shrink-0">
        <div className="h-5 w-16 rounded-full bg-zinc-800" />
        <div className="h-5 w-20 rounded-full bg-zinc-800" />
      </div>
    </div>
  );
}

/** Projects grid loading skeleton */
export function ProjectsListSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <ProjectCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Decisions list loading skeleton */
export function DecisionsListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <DecisionRowSkeleton key={i} />
      ))}
    </div>
  );
}
