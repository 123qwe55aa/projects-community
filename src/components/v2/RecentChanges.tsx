import Link from 'next/link';
import type { RecentChange } from '@/lib/v2/queries';

export function RecentChanges({ changes }: { changes: RecentChange[] }) {
  return (
    <section aria-labelledby="recent-changes-heading" className="space-y-4">
      <div>
        <h2 id="recent-changes-heading" className="text-xl font-semibold text-white">
          Recent Changes
        </h2>
        <p className="mt-1 text-sm text-zinc-500">The latest evidence-backed project events.</p>
      </div>

      {changes.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-500">
          No project changes recorded yet.
        </p>
      ) : (
        <ol className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          {changes.map((change) => (
            <li key={change.eventId} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                  {change.eventType.replaceAll('_', ' ')}
                </span>
                <Link
                  href={`/projects/${change.projectId}`}
                  className="text-sm font-medium text-white transition hover:text-emerald-300"
                >
                  {change.projectSummary ?? 'Unknown project'}
                </Link>
                <time dateTime={change.occurredAt} className="text-xs text-zinc-600">
                  {relativeTimestamp(change.occurredAt)}
                </time>
              </div>
              {change.rationale && <p className="mt-2 text-sm text-zinc-400">{change.rationale}</p>}
              {change.sourceQuote && (
                <blockquote className="mt-3 border-l border-zinc-700 pl-3 text-sm italic text-zinc-500">
                  &ldquo;{change.sourceQuote}&rdquo;
                </blockquote>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function relativeTimestamp(timestamp: string): string {
  const elapsedSeconds = Math.round((new Date(timestamp).getTime() - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  for (const [unit, seconds] of units) {
    if (Math.abs(elapsedSeconds) >= seconds) {
      return formatter.format(Math.round(elapsedSeconds / seconds), unit);
    }
  }
  return formatter.format(elapsedSeconds, 'second');
}
