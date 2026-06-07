import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDatabase } from '@/db';
import { decisions, candidates } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { CompareInterface } from './compare-interface';

export const metadata = {
  title: 'Compare Candidates',
};

export default async function ComparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db } = getDatabase();

  const [decision] = await db.select().from(decisions).where(eq(decisions.id, id));
  if (!decision) {
    notFound();
  }

  const decisionCandidates = await db
    .select()
    .from(candidates)
    .where(eq(candidates.decisionId, id))
    .orderBy(candidates.createdAt);

  // Parse dimensions JSON if present
  let dimensions: string[] | null = null;
  if (decision.dimensions) {
    try {
      dimensions = JSON.parse(decision.dimensions);
    } catch {
      dimensions = null;
    }
  }

  return (
    <div className="flex flex-1 flex-col p-8 max-w-6xl mx-auto w-full space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/decisions" className="hover:text-zinc-300 transition">
          Decisions
        </Link>
        <span>/</span>
        <Link href={`/decisions/${id}`} className="hover:text-zinc-300 transition">
          {decision.question}
        </Link>
        <span>/</span>
        <span className="text-zinc-300">Compare</span>
      </div>

      <CompareInterface
        decisionId={decision.id}
        decisionQuestion={decision.question}
        decisionState={decision.state}
        candidates={decisionCandidates.map((c) => ({
          id: c.id,
          name: c.name,
          currentFormSummary: c.currentFormSummary,
        }))}
        dimensions={dimensions}
      />
    </div>
  );
}