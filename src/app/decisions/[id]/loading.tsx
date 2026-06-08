export default function DecisionDetailLoading() {
  return (
    <div className="flex flex-1 flex-col p-8 max-w-5xl mx-auto w-full space-y-6 animate-pulse">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <div className="h-3.5 w-16 rounded bg-zinc-800" />
        <div className="h-3.5 w-3 rounded bg-zinc-800" />
        <div className="h-3.5 w-40 rounded bg-zinc-800" />
      </div>
      {/* Header */}
      <div className="space-y-3">
        <div className="h-8 w-2/3 rounded bg-zinc-800" />
        <div className="flex gap-2">
          <div className="h-5 w-20 rounded-full bg-zinc-800" />
          <div className="h-5 w-24 rounded-full bg-zinc-800" />
        </div>
      </div>
      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-32 rounded-lg bg-zinc-900 border border-zinc-800" />
          <div className="h-24 rounded-lg bg-zinc-900 border border-zinc-800" />
          <div className="h-20 rounded-lg bg-zinc-900 border border-zinc-800" />
        </div>
        <div className="space-y-4">
          <div className="h-40 rounded-lg bg-zinc-900 border border-zinc-800" />
        </div>
      </div>
    </div>
  );
}
