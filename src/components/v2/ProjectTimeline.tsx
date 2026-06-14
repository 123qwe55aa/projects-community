import type { ProjectTimelineItem } from '@/lib/v2/queries';

export function ProjectTimeline({ items }: { items: ProjectTimelineItem[] }) {
  return (
    <section aria-labelledby="evidence-timeline-heading" className="space-y-4">
      <div>
        <h2 id="evidence-timeline-heading" className="text-xl font-semibold text-white">
          Evidence Timeline
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Project events with the Hermes evidence that supports them.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
          No evidence-backed events have been recorded yet.
        </p>
      ) : (
        <ol className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          {items.map((item) => (
            <li key={item.eventId} className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">
                  {item.eventType.replaceAll('_', ' ')}
                </span>
                <time dateTime={item.occurredAt} className="text-xs text-zinc-500">
                  {formatTimestamp(item.occurredAt)}
                </time>
                <span className="text-xs text-zinc-600">by {item.actor}</span>
              </div>

              {item.rationale && <p className="text-sm text-zinc-300">{item.rationale}</p>}
              <EventPayload payload={item.payload} />

              {item.evidence.length > 0 && (
                <ul className="space-y-3 border-t border-zinc-800 pt-4">
                  {item.evidence.map((evidence) => (
                    <li key={evidence.observationId} className="space-y-2">
                      <p className="text-sm font-medium text-zinc-200">{evidence.summary}</p>
                      <blockquote className="border-l-2 border-emerald-600/60 pl-3 text-sm italic text-zinc-400">
                        &ldquo;{shortQuote(evidence.sourceQuote)}&rdquo;
                      </blockquote>
                      <p className="text-xs text-zinc-500">
                        Hermes source: {evidence.sourceConversationRef} / {evidence.sourceMessageRef}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function EventPayload({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter((entry): entry is [string, string] => (
    typeof entry[1] === 'string' && entry[1].trim().length > 0
  ));
  if (entries.length === 0) return null;

  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">{key.replaceAll('_', ' ')}</dt>
          <dd className="mt-1 text-zinc-300">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function shortQuote(quote: string) {
  return quote.length > 220 ? `${quote.slice(0, 217)}...` : quote;
}

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(timestamp));
}
