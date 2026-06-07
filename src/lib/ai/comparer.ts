/**
 * Comparison engine — generates a cross-candidate comparison using AI
 * and persists a Recommendation record in the DB.
 *
 * Isolation: each candidate's conversation history is fetched independently.
 * Cross-candidate context is assembled only for this comparison call.
 */

import 'dotenv/config';
import { generateText } from 'ai';
import { getAIModel } from './provider';
import {
  getDecision,
  listCandidates,
  listConversations,
  listMessages,
  createRecommendation,
} from '@/db/helpers';

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

export interface ComparisonResult {
  recommendationId: string;
  recommendedCandidateId: string;
  reasoning: string;
  sourceLinks: string[];
}

// ─────────────────────────────────────────────────
// generateComparison
// ─────────────────────────────────────────────────

/**
 * Compare all candidates for a decision and produce one clear recommendation.
 *
 * - Uses decision.dimensions and decision.weights (JSON-parsed).
 * - Fetches each candidate's full conversation history independently.
 * - Calls AI asking for ONE recommendation with reasoning and source links.
 * - Persists a Recommendation row in the DB (does NOT auto-adopt).
 * - Returns { recommendationId, recommendedCandidateId, reasoning, sourceLinks }.
 */
export async function generateComparison(decisionId: string): Promise<ComparisonResult> {
  const decision = await getDecision(decisionId);
  if (!decision) {
    throw new Error(`generateComparison: decision ${decisionId} not found`);
  }

  const candidates = await listCandidates(decisionId);
  if (candidates.length === 0) {
    throw new Error(`generateComparison: no candidates found for decision ${decisionId}`);
  }

  // Parse dimensions and weights
  const dimensions: string[] = decision.dimensions
    ? (JSON.parse(decision.dimensions as string) as string[])
    : [];
  const weights: Record<string, number> = decision.weights
    ? (JSON.parse(decision.weights as string) as Record<string, number>)
    : {};

  // Fetch each candidate's conversation (isolation respected)
  const candidateContexts = await Promise.all(
    candidates.map(async (candidate) => {
      const convs = await listConversations('candidate', candidate.id);
      let history = '(no conversation recorded)';
      if (convs.length > 0) {
        const msgs = await listMessages(convs[0].id);
        history = msgs
          .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
          .join('\n\n');
      }
      return {
        id: candidate.id,
        name: candidate.name,
        currentFormSummary: candidate.currentFormSummary,
        history,
      };
    }),
  );

  // Build comparison prompt
  const dimensionsBlock =
    dimensions.length > 0
      ? `Dimensions to compare:\n${dimensions
          .map((d) => {
            const w = weights[d];
            return `- ${d}${w !== undefined ? ` (weight: ${w})` : ''}`;
          })
          .join('\n')}`
      : 'No explicit dimensions defined. Use general engineering trade-off criteria.';

  const candidatesBlock = candidateContexts
    .map(
      (c, i) =>
        `## Candidate ${i + 1}: ${c.name} (ID: ${c.id})\n` +
        `Current-form summary: ${c.currentFormSummary ?? '(none)'}\n\n` +
        `Conversation history:\n${c.history}`,
    )
    .join('\n\n---\n\n');

  const prompt = `You are performing a structured comparison of candidate options for an architectural decision.

Decision question: "${decision.question}"

${dimensionsBlock}

${candidatesBlock}

---

Instructions:
1. Compare all candidates across the stated dimensions (or general trade-off criteria if none are defined).
2. Give ONE clear recommendation — identify the best candidate by name and ID.
3. Provide concise reasoning (max 300 words) grounded in the conversation evidence.
4. List any source links or references mentioned in the conversations as an array.

Respond in the following JSON format (no markdown fences):
{
  "recommendedCandidateId": "<candidate id>",
  "reasoning": "<explanation>",
  "sourceLinks": ["<url>", ...]
}`;

  const { text } = await generateText({
    model: getAIModel(),
    prompt,
    maxTokens: 800,
  });

  // Parse AI response
  let recommendedCandidateId: string;
  let reasoning: string;
  let sourceLinks: string[] = [];

  try {
    // Strip any accidental markdown fences
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned) as {
      recommendedCandidateId: string;
      reasoning: string;
      sourceLinks?: string[];
    };
    recommendedCandidateId = parsed.recommendedCandidateId;
    reasoning = parsed.reasoning;
    sourceLinks = parsed.sourceLinks ?? [];
  } catch {
    // Fallback: pick first candidate, use full text as reasoning
    console.error('[comparer] Failed to parse AI JSON response, using fallback');
    recommendedCandidateId = candidates[0].id;
    reasoning = text ?? 'No reasoning generated.';
    sourceLinks = [];
  }

  // Validate that the recommended candidate exists
  const validCandidate = candidates.find((c) => c.id === recommendedCandidateId);
  if (!validCandidate) {
    console.warn(
      `[comparer] AI returned unknown candidateId "${recommendedCandidateId}", falling back to first candidate`,
    );
    recommendedCandidateId = candidates[0].id;
  }

  // Persist recommendation to DB (does NOT auto-adopt or change decision state)
  const recommendation = await createRecommendation({
    decisionId,
    candidateId: recommendedCandidateId,
    reasoning,
    sourceLinks,
  });

  return {
    recommendationId: recommendation.id,
    recommendedCandidateId,
    reasoning,
    sourceLinks,
  };
}
