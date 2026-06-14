import type { ProjectHypothesisCard as ProjectHypothesisCardView } from '@/lib/v2/queries';
import {
  dismissHypothesisAction,
  promoteHypothesisAction,
} from '@/app/v2-actions';

export function HypothesisCard({ hypothesis }: { hypothesis: ProjectHypothesisCardView }) {
  const headingId = `hypothesis-${hypothesis.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900 p-5"
    >
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-400">
          {hypothesis.supportingEvidenceCount}{' '}
          {hypothesis.supportingEvidenceCount === 1 ? 'evidence item' : 'evidence items'}
        </p>
        <h2 id={headingId} className="text-xl font-semibold text-white">
          {hypothesis.title}
        </h2>
        <p className="text-sm leading-6 text-zinc-300">{hypothesis.explanation}</p>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Timestamp label="First seen" value={hypothesis.firstSeenAt} />
        <Timestamp label="Last seen" value={hypothesis.lastSeenAt} />
      </dl>

      <section aria-labelledby={`${headingId}-evidence`} className="space-y-3">
        <h3 id={`${headingId}-evidence`} className="text-sm font-semibold text-zinc-200">
          Latest supporting evidence
        </h3>
        {hypothesis.latestQuotes.length > 0 ? (
          <ul className="space-y-3">
            {hypothesis.latestQuotes.map((quote) => (
              <li
                key={quote.observationId}
                className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3"
              >
                <blockquote className="text-sm text-zinc-300">
                  &quot;{shortQuote(quote.sourceQuote)}&quot;
                </blockquote>
                <p className="mt-2 break-all text-xs text-zinc-500">
                  Hermes reference: {quote.sourceConversationRef} / {quote.sourceMessageRef}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No source quotes are available.</p>
        )}
      </section>

      <div className="flex flex-wrap gap-3 border-t border-zinc-800 pt-4">
        <form action={promoteHypothesisAction}>
          <input type="hidden" name="hypothesisId" value={hypothesis.id} />
          <ActionButton label="Promote to Project" />
        </form>
        <form action={dismissHypothesisAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="hypothesisId" value={hypothesis.id} />
          <label className="sr-only" htmlFor={`${hypothesis.id}-dismiss-rationale`}>
            Dismissal rationale for {hypothesis.title}
          </label>
          <input
            id={`${hypothesis.id}-dismiss-rationale`}
            name="rationale"
            required
            placeholder="Why is this not a Project?"
            className="min-w-64 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
          />
          <ActionButton label="Dismiss" subdued />
        </form>
      </div>
    </article>
  );
}

function Timestamp({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-zinc-300">
        <time dateTime={value}>{formatTimestamp(value)}</time>
      </dd>
    </div>
  );
}

function ActionButton({ label, subdued = false }: { label: string; subdued?: boolean }) {
  return (
    <button
      type="submit"
      className={
        subdued
          ? 'rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400'
          : 'rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400'
      }
    >
      {label}
    </button>
  );
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function shortQuote(quote: string) {
  return quote.length > 240 ? `${quote.slice(0, 237)}...` : quote;
}
