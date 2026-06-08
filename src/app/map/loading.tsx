export default function MapLoading() {
  return (
    <div className="flex flex-1 flex-col h-full">
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded bg-zinc-800 animate-pulse" />
          <div className="h-4 w-64 rounded bg-zinc-800/70 animate-pulse" />
        </div>
        <div className="h-8 w-24 rounded-lg bg-zinc-800 animate-pulse" />
      </div>
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="text-sm text-zinc-600 animate-pulse">Loading community map…</div>
      </div>
    </div>
  );
}
