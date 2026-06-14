import { CurrentProjects } from '@/components/v2/CurrentProjects';
import { NeedsAttention } from '@/components/v2/NeedsAttention';
import { RecentChanges } from '@/components/v2/RecentChanges';
import { getDashboardData } from '@/lib/v2/queries';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const data = await getDashboardData();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 p-6 sm:p-8">
      <header className="space-y-2 border-b border-zinc-800 pb-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
          Hermes-first project observatory
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white">Current Projects</h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          A current-state view of project momentum, unresolved signals, and recent evidence-backed
          changes.
        </p>
      </header>

      <CurrentProjects projects={data.currentProjects} />
      <NeedsAttention items={data.needsAttention} />
      <RecentChanges changes={data.recentChanges} />
    </div>
  );
}
