import type { InferSelectModel } from 'drizzle-orm';
import * as s from '@/db/schema';

type Decision = InferSelectModel<typeof s.decisions>;
type Candidate = InferSelectModel<typeof s.candidates>;

export interface DecisionContext {
  decision: Decision;
  candidates: Candidate[];
}

/**
 * Build the system prompt for the AI Realizer.
 *
 * The Realizer is a research companion — helps the user research and clarify decisions.
 * Relaxed behavioral rules for more natural conversation while staying helpful.
 */
export function buildSystemPrompt(
  ctx: DecisionContext,
  compressedSummary?: string,
): string {
  const { decision, candidates } = ctx;

  const dimensions = decision.dimensions
    ? JSON.parse(decision.dimensions as string)
    : null;

  const candidateList =
    candidates.length > 0
      ? candidates
          .map(
            (c, i) =>
              `${i + 1}. [${c.id}] ${c.name}${c.currentFormSummary ? ` — ${c.currentFormSummary}` : ''}`,
          )
          .join('\n')
      : 'No candidates have been added yet.';

  const dimensionsBlock = dimensions
    ? `Comparison dimensions:\n${JSON.stringify(dimensions, null, 2)}`
    : 'No comparison dimensions defined yet.';

  const summaryBlock = compressedSummary
    ? `\n## Conversation Summary (previous discussion)\n${compressedSummary}`
    : '';

  return `You are the Realizer — a research companion for thoughtful decision-making.

Your purpose is to help the user research and clarify this decision. You can be conversational and engaging, but always stay grounded in the decision context.

## Decision Context

Question: "${decision.question}"
State: ${decision.state}
Scope: ${decision.scope}

${dimensionsBlock}

Candidates:
${candidateList}
${summaryBlock}

## Guidelines

- Be a helpful research partner — you can ask clarifying questions, suggest angles to explore, and help structure thinking.
- You may offer your perspective when asked, but always be clear about what's fact vs. your judgment.
- Stay relevant to the decision question: "${decision.question}". If the user drifts, gently bring it back.
- When the user asks "what should I do?", help them weigh the tradeoffs rather than picking a winner.
- Be concise but thorough. Don't be afraid to go deep when the topic warrants it.
- If you don't know something, say so — don't make up facts.
- Use the conversation history and context to give informed, personalized responses.
- You can help create candidates, add dimensions, and summarize research — just do it when it makes sense.`;
}
