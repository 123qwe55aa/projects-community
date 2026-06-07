/**
 * Summary generation — produces and persists AI-generated summaries.
 * All functions fail gracefully; they never throw or block the caller.
 */

import 'dotenv/config';
import { generateText } from 'ai';
import { getAIModel } from './provider';
import {
  getProject,
  updateProject,
  getCandidate,
  updateCandidate,
  listDecisions,
  listConversations,
  listMessages,
  getCurrentAdoption,
} from '@/db/helpers';
import { getDatabase } from '@/db';
import * as s from '@/db/schema';
import { eq } from 'drizzle-orm';

// ─────────────────────────────────────────────────
// generateProjectSummary
// ─────────────────────────────────────────────────

/**
 * Generate and persist a project-level summary.
 *
 * Covers:
 *  - project background
 *  - unresolved questions
 *  - decisions being researched
 *  - adopted decisions & their current status
 *  - referenced global decisions
 *
 * On failure: logs the error and returns an empty string — does NOT throw.
 */
export async function generateProjectSummary(projectId: string): Promise<string> {
  try {
    const project = await getProject(projectId);
    if (!project) return '';

    const decisions = await listDecisions({ projectId });

    // For each decision, fetch adoption snapshot
    const { db } = getDatabase();
    const decisionsWithAdoption = await Promise.all(
      decisions.map(async (d) => {
        const adoption = await getCurrentAdoption(d.id);
        return { ...d, adoption };
      }),
    );

    // Build context for the AI
    const researchingDecisions = decisionsWithAdoption.filter((d) => d.state === 'researching');
    const decidedDecisions = decisionsWithAdoption.filter((d) => d.state === 'decided' && d.adoption);
    const globalDecisions = decisionsWithAdoption.filter((d) => d.scope === 'global');

    const prompt = `You are summarizing the current state of a project for an internal knowledge base.

Project background:
${project.background ?? '(none)'}

Decisions being researched (${researchingDecisions.length}):
${researchingDecisions.map((d) => `- "${d.question}" (state: ${d.state})`).join('\n') || '(none)'}

Adopted decisions (${decidedDecisions.length}):
${
  decidedDecisions
    .map(
      (d) =>
        `- "${d.question}": adopted candidate summary: ${d.adoption?.candidateSummary ?? '(no summary)'}`,
    )
    .join('\n') || '(none)'
}

Referenced global decisions (${globalDecisions.length}):
${globalDecisions.map((d) => `- "${d.question}" (state: ${d.state})`).join('\n') || '(none)'}

Write a concise project summary (max 300 words) covering:
1. Project background & purpose
2. Open/unresolved questions
3. Decisions currently being researched
4. Adopted decisions and their current status
5. Referenced global decisions

Be factual. No editorializing.`;

    const { text } = await generateText({
      model: getAIModel(),
      prompt,
      maxTokens: 600,
    });

    if (text) {
      await updateProject(projectId, { summary: text });
    }

    return text ?? '';
  } catch (err) {
    console.error('[summarizer] generateProjectSummary failed:', err);
    return '';
  }
}

// ─────────────────────────────────────────────────
// generateCandidateSummary
// ─────────────────────────────────────────────────

/**
 * Generate and persist a candidate's "current-form" summary.
 *
 * Covers: architecture, components, dependent services, operating model.
 * Costs/benefits/risks are deliberately excluded — those stay in conversation.
 *
 * On failure: logs the error and returns an empty string — does NOT throw.
 */
export async function generateCandidateSummary(candidateId: string): Promise<string> {
  try {
    const candidate = await getCandidate(candidateId);
    if (!candidate) return '';

    // Fetch this candidate's conversation messages
    const convs = await listConversations('candidate', candidateId);
    let conversationText = '(no conversation yet)';
    if (convs.length > 0) {
      const msgs = await listMessages(convs[0].id);
      conversationText = msgs
        .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
        .join('\n\n');
    }

    const prompt = `You are summarizing the current state of a candidate option for an architectural decision record.

Candidate name: ${candidate.name}

Conversation history:
${conversationText}

Write a concise "current-form" summary (max 200 words) covering ONLY:
1. Architecture overview
2. Key components
3. Dependent services / integrations
4. Operating model (how it is deployed, managed, scaled)

Do NOT include: costs, benefits, risks, opinions, or recommendations. Factual only.`;

    const { text } = await generateText({
      model: getAIModel(),
      prompt,
      maxTokens: 400,
    });

    if (text) {
      await updateCandidate(candidateId, { currentFormSummary: text });
    }

    return text ?? '';
  } catch (err) {
    console.error('[summarizer] generateCandidateSummary failed:', err);
    return '';
  }
}

// ─────────────────────────────────────────────────
// generateDecisionSummary (alias used by route)
// ─────────────────────────────────────────────────

/**
 * Trigger summaries for all candidates of a decision.
 * Used by the chat route when message count hits a threshold.
 * Fails gracefully.
 */
export async function generateDecisionSummary(decisionId: string): Promise<void> {
  try {
    const { db } = getDatabase();
    const candidateRows = await db
      .select({ id: s.candidates.id })
      .from(s.candidates)
      .where(eq(s.candidates.decisionId, decisionId));

    await Promise.allSettled(
      candidateRows.map((c) => generateCandidateSummary(c.id)),
    );
  } catch (err) {
    console.error('[summarizer] generateDecisionSummary failed:', err);
  }
}
