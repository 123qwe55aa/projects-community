import Link from 'next/link';
import type { AttentionItem } from '@/lib/v2/queries';

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  const pendingItems = items.slice(0, 5);

  return (
    <section aria-labelledby="needs-attention-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="needs-attention-heading" className="text-xl font-semibold text-white">
            Needs Attention ({items.length})
          </h2>
          <p className="mt-1 text-sm text-zinc-400">Pending observations that need a human call.</p>
        </div>
        <Link href="/attention" className="text-sm text-amber-400 transition hover:text-amber-300">
          Review all
        </Link>
      </div>

      {pendingItems.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
          Nothing needs attention right now.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {pendingItems.map((item) => (
            <li key={item.observationId} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-zinc-200">{item.summary}</p>
                <span className="shrink-0 rounded-full bg-amber-950/50 px-2 py-0.5 text-xs text-amber-300">
                  {item.type.replaceAll('_', ' ')}
                </span>
              </div>
              <blockquote className="mt-3 border-l border-zinc-700 pl-3 text-sm italic text-zinc-400">
                &ldquo;{item.sourceQuote}&rdquo;
              </blockquote>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
