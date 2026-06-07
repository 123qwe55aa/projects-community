import Link from 'next/link';
import type { InferSelectModel } from 'drizzle-orm';
import type { decisions } from '@/db/schema';

type Decision = Pick<InferSelectModel<typeof decisions>, 'id' | 'question' | 'state'>;

interface UnresolvedQuestionsProps {
  decisions: Decision[];
}

const stateBadge: Record<string, { label: string; classes: string }> = {
  researching: { label: 'Researching', classes: 'bg-yellow-900/40 text-yellow-400 border-yellow-700' },
  deferred: { label: 'Deferred', classes: 'bg-zinc-800 text-zinc-400 border-zinc-600' },
};

export function UnresolvedQuestions({ decisions }: UnresolvedQuestionsProps) {
  const unresolved = decisions.filter(
    (d) => d.state === 'researching' || d.state === 'deferred'
  );

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
      <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
        Unresolved Questions
      </h2>

      {unresolved.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">No unresolved questions.</p>
      ) : (
        <ul className="space-y-1.5">
          {unresolved.map((d) => {
            const badge = stateBadge[d.state];
            return (
              <li key={d.id}>
                <Link
                  href={`/decisions/${d.id}`}
                  className="group flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-zinc-800 transition"
                >
                  <span className="text-sm text-zinc-300 group-hover:text-white line-clamp-1 flex-1">
                    {d.question}
                  </span>
                  {badge && (
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${badge.classes}`}
                    >
                      {badge.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
