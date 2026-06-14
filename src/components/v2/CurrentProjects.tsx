import Link from 'next/link';
import type { CurrentProjectCard, LifecycleState } from '@/lib/v2/queries';

const lifecycleOrder: LifecycleState[] = ['active', 'dormant', 'ended', 'archived'];

const lifecycleStyles: Record<LifecycleState, string> = {
  active: 'border-emerald-800/70 bg-emerald-950/20 text-emerald-300',
  dormant: 'border-amber-800/70 bg-amber-950/20 text-amber-300',
  ended: 'border-sky-800/70 bg-sky-950/20 text-sky-300',
  archived: 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
};

export function CurrentProjects({ projects }: { projects: CurrentProjectCard[] }) {
  if (projects.length === 0) {
    return (
      <section aria-label="Current Projects">
        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <p className="text-sm text-zinc-400">No current project snapshots yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Current Projects" className="space-y-8">
      {lifecycleOrder.map((state) => {
        const groupedProjects = projects.filter((project) => project.lifecycleState === state);
        if (groupedProjects.length === 0) return null;

        return (
          <div key={state} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold capitalize text-zinc-200">{state}</h2>
              <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs text-zinc-400">
                {groupedProjects.length}
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {groupedProjects.map((project) => (
                <ProjectCard key={project.projectId} project={project} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function ProjectCard({ project }: { project: CurrentProjectCard }) {
  const latestChange = project.recentChanges[0];

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-base font-semibold text-white">
          <Link
            href={`/projects/${project.projectId}`}
            className="transition hover:text-emerald-300"
          >
            {project.summary}
          </Link>
        </h3>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs capitalize ${lifecycleStyles[project.lifecycleState]}`}
        >
          {project.lifecycleState}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <ProjectDetail label="Lifecycle rationale" value={project.lifecycleRationale} />
        <ProjectDetail label="Latest change" value={describeChange(latestChange)} />
        <ProjectDetail
          label="Obstacles"
          value={project.obstacles.length > 0 ? project.obstacles.join(', ') : null}
        />
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Evidence</dt>
          <dd className="mt-1 text-zinc-300">
            {project.evidenceCount} {project.evidenceCount === 1 ? 'source' : 'sources'}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function ProjectDetail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className="mt-1 text-zinc-300">{value ?? 'None recorded'}</dd>
    </div>
  );
}

function describeChange(change: Record<string, unknown> | undefined): string | null {
  if (!change) return null;
  for (const key of ['summary', 'rationale', 'description', 'eventType', 'event_type', 'type']) {
    const value = change[key];
    if (typeof value === 'string' && value.trim()) return value.replaceAll('_', ' ');
  }
  return 'Project state updated';
}
