export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col p-8 max-w-6xl mx-auto w-full space-y-6 animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-16 bg-zinc-800 rounded" />
        <div className="h-4 w-4 bg-zinc-800 rounded" />
        <div className="h-4 w-24 bg-zinc-800 rounded" />
        <div className="h-4 w-4 bg-zinc-800 rounded" />
        <div className="h-4 w-20 bg-zinc-800 rounded" />
      </div>

      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-64 bg-zinc-800 rounded" />
        <div className="h-4 w-40 bg-zinc-800 rounded" />
      </div>

      {/* Overview section skeleton */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
        <div className="h-4 w-20 bg-zinc-800 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-16 bg-zinc-800 rounded" />
              <div className="h-5 w-24 bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Statistics section skeleton */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
        <div className="h-4 w-20 bg-zinc-800 rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-center space-y-2">
              <div className="h-8 w-12 bg-zinc-800 rounded mx-auto" />
              <div className="h-3 w-16 bg-zinc-800 rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
        <div className="h-4 w-20 bg-zinc-800 rounded" />
        <div className="space-y-3 pl-6 border-l border-zinc-800">
          {[1, 2, 3].map((i) => (
            <div key={i} className="relative pb-3 space-y-1">
              <div className="h-3 w-32 bg-zinc-800 rounded" />
              <div className="h-4 w-48 bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
