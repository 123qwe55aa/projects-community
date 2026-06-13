import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDashboardData } from '@/lib/dashboard-queries';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export const metadata = {
  title: 'Dashboard',
};

const styleLabels: Record<string, string> = {
  workshop: '🔨 Workshop',
  'data-center': '📊 Data Center',
  studio: '🎨 Studio',
  'community-hall': '🏛️ Community Hall',
};

const stateBadge: Record<string, { label: string; classes: string }> = {
  researching: { label: 'Researching', classes: 'bg-yellow-900/40 text-yellow-400 border-yellow-700' },
  deferred: { label: 'Deferred', classes: 'bg-zinc-800 text-zinc-400 border-zinc-600' },
  decided: { label: 'Decided', classes: 'bg-green-900/40 text-green-400 border-green-700' },
  archived: { label: 'Archived', classes: 'bg-zinc-800 text-zinc-500 border-zinc-700' },
};

const timelineIcons: Record<string, string> = {
  project_created: '🏗️',
  decision_created: '⚖️',
  adoption_created: '✅',
};

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getDashboardData(id);

  if (!data) notFound();

  const { project, stats, timeline } = data;

  // Limit timeline to recent 20 events
  const recentTimeline = timeline.slice(0, 20);

  return (
    <ErrorBoundary>
      <div className="flex flex-1 flex-col p-8 max-w-6xl mx-auto w-full space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/projects" className="hover:text-zinc-300 transition">
            Projects
          </Link>
          <span>/</span>
          <Link href={`/projects/${project.id}`} className="hover:text-zinc-300 transition">
            {project.summary || 'Project'}
          </Link>
          <span>/</span>
          <span className="text-zinc-300">Dashboard</span>
        </div>

        {/* Page Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {project.summary || 'Untitled Project'}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">Project Dashboard</p>
          </div>
          <Link
            href={`/projects/${project.id}`}
            className="shrink-0 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition"
          >
            ← Back to Project
          </Link>
        </div>

        {/* ── Overview Section ────────────────────────────────────────────── */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
            Overview
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Project Info */}
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">Building Style</p>
              <p className="text-sm text-zinc-200">
                {styleLabels[project.buildingStyle ?? ''] || project.buildingStyle || '—'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">Growth Stage</p>
              <p className="text-sm text-zinc-200 capitalize">
                {project.growthStage || 'seed'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">Created</p>
              <p className="text-sm text-zinc-200">
                {formatDate(project.createdAt)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">Last Updated</p>
              <p className="text-sm text-zinc-200">
                {formatDate(project.updatedAt)}
              </p>
            </div>
          </div>

          {/* Background & Summary */}
          {(project.background || project.summary) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-800">
              {project.summary && (
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">Summary</p>
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    {project.summary}
                  </p>
                </div>
              )}
              {project.background && project.background !== project.summary && (
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">Background</p>
                  <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">
                    {project.background}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quick actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
            <Link
              href={`/projects/${project.id}`}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition"
            >
              View Project Details →
            </Link>
            <Link
              href={`/projects/${project.id}`}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition"
            >
              Go to Project →
            </Link>
          </div>
        </section>

        {/* ── Statistics Section ──────────────────────────────────────────── */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
            Statistics
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Total Decisions */}
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-center">
              <p className="text-2xl font-bold text-white">
                {stats.totalDecisions}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Decisions</p>
            </div>

            {/* Adoption Snapshots */}
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-center">
              <p className="text-2xl font-bold text-white">
                {stats.adoptionSnapshotCount}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Adoptions</p>
            </div>

            {/* Candidates */}
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-center">
              <p className="text-2xl font-bold text-white">
                {stats.candidateCount}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Candidates</p>
            </div>

            {/* Recent Activity */}
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-center">
              <p className="text-sm font-medium text-white">
                {formatDate(stats.recentActivity)}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Recent Activity</p>
            </div>
          </div>

          {/* Decisions by state breakdown */}
          {stats.decisionsByState.length > 0 && (
            <div className="pt-2 border-t border-zinc-800">
              <p className="text-xs text-zinc-500 mb-2">Decisions by Status</p>
              <div className="flex flex-wrap gap-2">
                {stats.decisionsByState.map((item) => {
                  const badge = stateBadge[item.state] || stateBadge.researching;
                  return (
                    <span
                      key={item.state}
                      className={`rounded-full border px-3 py-1 text-xs ${badge.classes}`}
                    >
                      {badge.label}: {item.count}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state for stats */}
          {stats.totalDecisions === 0 && stats.adoptionSnapshotCount === 0 && (
            <div className="text-center py-6">
              <p className="text-sm text-zinc-500 italic">
                No data yet. Create a decision to start seeing statistics.
              </p>
              <Link
                href={`/projects/${project.id}`}
                className="inline-block mt-2 text-sm text-zinc-400 hover:text-zinc-200 underline"
              >
                Go to Project →
              </Link>
            </div>
          )}
        </section>

        {/* ── Timeline Section ─────────────────────────────────────────────── */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
            Timeline
          </h2>

          {recentTimeline.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-4xl">📅</p>
              <p className="text-sm text-zinc-500 italic">
                No events yet. Activity will appear here as you create decisions and adopt solutions.
              </p>
            </div>
          ) : (
            <div className="relative space-y-0 pl-6 border-l border-zinc-800">
              {recentTimeline.map((event, i) => (
                <div
                  key={event.id}
                  className={`relative pb-5 ${i === recentTimeline.length - 1 ? 'pb-0' : ''}`}
                >
                  {/* Timeline dot */}
                  <span className="absolute -left-[1.35rem] top-1 h-2.5 w-2.5 rounded-full border-2 bg-zinc-700 border-zinc-600" />

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs">
                        {timelineIcons[event.type] || '📌'}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {formatDateTime(event.date)}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300">
                      {event.link ? (
                        <Link
                          href={event.link}
                          className="hover:text-white hover:underline transition"
                        >
                          {event.summary}
                        </Link>
                      ) : (
                        event.summary
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Show more indicator */}
          {timeline.length > 20 && (
            <p className="text-xs text-zinc-600 text-center pt-2">
              Showing 20 of {timeline.length} events
            </p>
          )}
        </section>
      </div>
    </ErrorBoundary>
  );
}
