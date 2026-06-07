import { getDatabase } from '@/db';
import { recommendations, candidates } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { AdoptButton } from '@/app/decisions/[id]/adopt-button';

interface RecommendationCardProps {
  decisionId: string;
  decisionState: string;
}

export async function RecommendationCard({
  decisionId,
  decisionState,
}: RecommendationCardProps) {
  const { db } = getDatabase();

  // Get current recommendation
  const [rec] = await db
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.decisionId, decisionId),
        eq(recommendations.isCurrent, true)
      )
    );

  if (!rec) return null;

  // Get the recommended candidate
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, rec.candidateId));

  let sourceLinks: string[] = [];
  if (rec.sourceLinks) {
    try {
      sourceLinks = JSON.parse(rec.sourceLinks);
    } catch {
      sourceLinks = [];
    }
  }

  return (
    <div className="rounded-lg border border-blue-800 bg-blue-950/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm">🎯</span>
        <h2 className="text-sm font-medium text-blue-300 uppercase tracking-wide">
          AI Recommendation
        </h2>
      </div>

      <div className="space-y-2">
        <p className="text-base font-semibold text-white">
          {candidate?.name ?? 'Unknown candidate'}
        </p>
        <p className="text-sm text-blue-200/70 leading-relaxed">{rec.reasoning}</p>
      </div>

      {sourceLinks.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-zinc-500">Sources</p>
          <ul className="space-y-0.5">
            {sourceLinks.slice(0, 3).map((link, i) => (
              <li key={i}>
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 transition truncate block"
                >
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {candidate && decisionState !== 'decided' && (
        <div className="pt-1">
          <AdoptButton
            decisionId={decisionId}
            candidateId={candidate.id}
            candidateName={candidate.name}
            candidateSummary={candidate.currentFormSummary}
            decisionState={decisionState}
          />
        </div>
      )}
    </div>
  );
}
