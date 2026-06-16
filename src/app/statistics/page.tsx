import { getStatisticsOverview, type StatisticsOverview } from '@/lib/statistics/queries';
import { StatisticsManager, type SerializableStatisticsOverview } from './statistics-manager';

export const metadata = {
  title: 'Statistics',
};

export const dynamic = 'force-dynamic';

export default async function StatisticsPage() {
  const overview = await getStatisticsOverview();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 p-6 sm:p-8">
      <header className="space-y-2 border-b border-zinc-800 pb-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
          Local snapshot
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white">Statistics</h1>
        <p className="max-w-3xl text-sm leading-6 text-zinc-400">
          Portfolio statistics are rendered from the local database snapshot. This page does not
          auto-sync with GitHub; use the sync actions when you want to refresh stored metrics.
        </p>
      </header>

      <StatisticsManager overview={serializeOverview(overview)} />
    </main>
  );
}

function serializeOverview(overview: StatisticsOverview): SerializableStatisticsOverview {
  return {
    ...overview,
    activityRanking: overview.activityRanking.map((row) => ({
      ...row,
      lastSuccessfulAt: serializeDate(row.lastSuccessfulAt),
    })),
    projects: overview.projects.map((project) => ({
      ...project,
      lastAttemptedAt: serializeDate(project.lastAttemptedAt),
      lastSuccessfulAt: serializeDate(project.lastSuccessfulAt),
    })),
  };
}

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
