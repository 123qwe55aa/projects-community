import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { getDatabase } from '@/db';
import { decisions, candidates, conversations, messages } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { buildSystemPrompt } from '@/lib/system-prompt';
import { getAIModel } from '@/lib/ai/provider';
import { assembleContext } from '@/lib/ai/context-assembler';
import { generateDecisionSummary } from '@/lib/ai/summarizer';

// Load environment variables from .env.local for local development
import 'dotenv/config';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { decisionId, candidateId, messages: chatMessages } = body as {
      decisionId: string;
      candidateId?: string;
      messages: { role: string; content: string }[];
    };

    if (!decisionId || !chatMessages || chatMessages.length === 0) {
      return new Response(JSON.stringify({ error: 'decisionId and messages are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { db } = getDatabase();

    // Fetch decision
    const [decision] = await db.select().from(decisions).where(eq(decisions.id, decisionId));
    if (!decision) {
      return new Response(JSON.stringify({ error: 'Decision not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch candidates
    const decisionCandidates = await db
      .select()
      .from(candidates)
      .where(eq(candidates.decisionId, decisionId));

    // Assemble context (conversation, pinned messages, recent history)
    const ctx = await assembleContext(decisionId, candidateId);
    const { conversationId } = ctx;

    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      decision,
      candidates: decisionCandidates,
    });

    // Filter context: if candidate-scoped, narrow the candidate list
    let scopeContext = '';
    if (candidateId) {
      const targetCandidate = decisionCandidates.find((c) => c.id === candidateId);
      if (targetCandidate) {
        scopeContext = `\n\nThe user is currently focused on a specific candidate: **${targetCandidate.name}** (ID: ${targetCandidate.id}).${targetCandidate.currentFormSummary ? ` Summary: ${targetCandidate.currentFormSummary}` : ''} Tailor your responses to this candidate while still operating within the decision's scope.`;
      }
    }

    // Append pinned message context to system prompt if any pins exist
    let pinnedContext = '';
    if (ctx.pinnedMessages.length > 0) {
      pinnedContext =
        '\n\n## Pinned Messages (key reference points)\n' +
        ctx.pinnedMessages
          .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
          .join('\n\n');
    }

    // Save the latest user message to DB (only the last one, which is the new user message)
    const latestUserMessage = chatMessages.filter((m) => m.role === 'user').pop();
    if (latestUserMessage) {
      await db.insert(messages).values({
        id: nanoid(),
        conversationId,
        role: 'user',
        content: latestUserMessage.content,
        createdAt: new Date(),
      });
    }

    // Build AI SDK messages from the assembled recent history + client-sent messages.
    // Prefer DB history if available; fall back to client-sent messages.
    const historyMessages =
      ctx.recentMessages.length > 0
        ? ctx.recentMessages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }))
        : chatMessages.map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

    // Stream the response
    const result = streamText({
      model: getAIModel(),
      system: systemPrompt + scopeContext + pinnedContext,
      messages: historyMessages,
      onFinish: async ({ text }) => {
        // Save assistant response to DB after streaming completes
        if (text) {
          await db.insert(messages).values({
            id: nanoid(),
            conversationId,
            role: 'assistant',
            content: text,
            createdAt: new Date(),
          });

          // Trigger summary refresh every 5 assistant messages (fire-and-forget)
          try {
            const allMsgs = await db
              .select({ id: messages.id })
              .from(messages)
              .where(eq(messages.conversationId, conversationId));
            const assistantCount = allMsgs.length; // approximate; close enough for mod check
            if (assistantCount % 5 === 0) {
              // Non-blocking — don't await, don't let errors bubble up
              generateDecisionSummary(decisionId).catch((err) =>
                console.error('[/api/chat] generateDecisionSummary error:', err),
              );
            }
          } catch {
            // Never block streaming on summary errors
          }
        }
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('[/api/chat] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}