import { ProjectsListSkeleton } from '@/components/Skeletons';

export default function ProjectsLoading() {
  return (
    <div className="flex flex-1 flex-col p-8 max-w-6xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-24 rounded bg-zinc-800 animate-pulse" />
          <div className="h-4 w-56 rounded bg-zinc-800/70 animate-pulse" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-zinc-800 animate-pulse" />
      </div>
      <ProjectsListSkeleton />
    </div>
  );
}
