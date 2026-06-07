import type { InferSelectModel } from 'drizzle-orm';
import type { adoptionSnapshots, candidates } from '@/db/schema';

type Snapshot = InferSelectModel<typeof adoptionSnapshots>;
type Candidate = Pick<InferSelectModel<typeof candidates>, 'id' | 'name'>;

interface AdoptionHistoryProps {
  snapshots: Snapshot[];
  candidates: Candidate[];
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function AdoptionHistory({ snapshots, candidates }: AdoptionHistoryProps) {
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));

  // Sort: current first, then by adoptedAt desc
  const sorted = [...snapshots].sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    const aTime = a.adoptedAt ? new Date(a.adoptedAt).getTime() : 0;
    const bTime = b.adoptedAt ? new Date(b.adoptedAt).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
      <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
        Adoption History
      </h2>

      {sorted.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">No decisions adopted yet.</p>
      ) : (
        <ol className="relative space-y-3 pl-4 border-l border-zinc-800">
          {sorted.map((snap) => {
            const candidate = candidateMap.get(snap.candidateId);
            return (
              <li
                key={snap.id}
                className={[
                  'relative pl-4',
                  snap.isCurrent ? '' : 'opacity-50',
                ].join(' ')}
              >
                {/* timeline dot */}
                <span
                  className={[
                    'absolute -left-[1.15rem] top-1.5 h-2.5 w-2.5 rounded-full border-2',
                    snap.isCurrent
                      ? 'bg-green-400 border-green-600'
                      : 'bg-zinc-600 border-zinc-700',
                  ].join(' ')}
                />

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={[
                        'text-sm font-medium',
                        snap.isCurrent ? 'text-white' : 'text-zinc-400',
                      ].join(' ')}
                    >
                      {candidate?.name ?? snap.candidateId}
                    </span>
                    {snap.isCurrent && (
                      <span className="rounded-full border border-green-700 bg-green-900/40 px-2 py-0.5 text-xs text-green-400">
                        Current
                      </span>
                    )}
                    {snap.adoptedAt && (
                      <span className="text-xs text-zinc-600">
                        {formatDate(snap.adoptedAt)}
                      </span>
                    )}
                  </div>
                  {snap.reasoning && (
                    <p className="text-xs text-zinc-500 line-clamp-2">{snap.reasoning}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
