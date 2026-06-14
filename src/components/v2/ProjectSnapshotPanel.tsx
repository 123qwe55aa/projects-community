import type { LifecycleState } from '@/lib/v2/queries';

export type ProjectSnapshotView = {
  summary: string;
  lifecycleState: LifecycleState;
  lifecycleRationale: string | null;
  activeThemes: string[];
  obstacles: string[];
  unresolvedQuestions: string[];
  recentChanges: Array<Record<string, unknown>>;
};

const lifecycleStyles: Record<LifecycleState, string> = {
  active: 'border-emerald-800/70 bg-emerald-950/30 text-emerald-300',
  dormant: 'border-amber-800/70 bg-amber-950/30 text-amber-300',
  ended: 'border-sky-800/70 bg-sky-950/30 text-sky-300',
  archived: 'border-zinc-700 bg-zinc-800 text-zinc-300',
};

export function ProjectSnapshotPanel({ snapshot }: { snapshot: ProjectSnapshotView | null }) {
  return (
    <section aria-labelledby="current-state-heading" className="space-y-4">
      <div>
        <h2 id="current-state-heading" className="text-xl font-semibold text-white">
          Current State
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          The latest evidence-backed projection of this Project.
        </p>
      </div>

      {!snapshot ? (
        <p className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
          No evidence-backed snapshot has been recorded yet.
        </p>
      ) : (
        <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Summary</p>
              <p className="mt-1 text-base text-zinc-100">{snapshot.summary || 'No summary recorded'}</p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${lifecycleStyles[snapshot.lifecycleState]}`}
            >
              {snapshot.lifecycleState}
            </span>
          </div>

          <Detail label="Lifecycle rationale" value={snapshot.lifecycleRationale} />

          <div className="grid gap-5 border-t border-zinc-800 pt-5 md:grid-cols-3">
            <ListDetail label="Active themes" values={snapshot.activeThemes} />
            <ListDetail label="Obstacles" values={snapshot.obstacles} />
            <ListDetail label="Unresolved questions" values={snapshot.unresolvedQuestions} />
          </div>

          <div className="border-t border-zinc-800 pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Latest changes</p>
            {snapshot.recentChanges.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-400">None recorded</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {snapshot.recentChanges.map((change, index) => (
                  <li key={changeKey(change, index)} className="text-sm text-zinc-300">
                    {describeChange(change)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-zinc-300">{value ?? 'None recorded'}</p>
    </div>
  );
}

function ListDetail({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      {values.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-400">None recorded</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-zinc-300">
          {values.map((value) => <li key={value}>{value}</li>)}
        </ul>
      )}
    </div>
  );
}

function describeChange(change: Record<string, unknown>) {
  const eventType = textValue(change.eventType)?.replaceAll('_', ' ');
  const rationale = textValue(change.rationale);
  const payload = objectValue(change.payload);
  const detail = payload && firstTextValue(payload);
  return [eventType, detail, rationale].filter(Boolean).join(': ') || 'Project state updated';
}

function changeKey(change: Record<string, unknown>, index: number) {
  return textValue(change.id) ?? `${describeChange(change)}-${index}`;
}

function firstTextValue(value: Record<string, unknown>) {
  for (const entry of Object.values(value)) {
    if (typeof entry === 'string' && entry.trim()) return entry;
  }
  return null;
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function objectValue(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
