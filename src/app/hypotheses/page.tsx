import { HypothesisCard } from '@/components/v2/HypothesisCard';
import { getProjectHypotheses } from '@/lib/v2/queries';

export const metadata = {
  title: 'Project Hypotheses',
};

export const dynamic = 'force-dynamic';

export default async function HypothesesPage() {
  const hypotheses = await getProjectHypotheses();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-6 sm:p-8">
      <header className="border-b border-zinc-800 pb-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
          Evidence-backed possibilities
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white">Project Hypotheses</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Review repeated themes Hermes has observed. Promote a hypothesis when the evidence
          describes a real Project, or dismiss it while preserving its supporting evidence.
        </p>
      </header>

      {hypotheses.length > 0 ? (
        <section aria-label="Emerging Project hypotheses" className="space-y-4">
          {hypotheses.map((hypothesis) => (
            <HypothesisCard key={hypothesis.id} hypothesis={hypothesis} />
          ))}
        </section>
      ) : (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <h2 className="text-xl font-semibold text-white">No emerging hypotheses</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Repeated Hermes observations will appear here for review.
          </p>
        </section>
      )}
    </main>
  );
}
