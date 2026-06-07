import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getDatabase } from '@/db';
import { decisions, candidates, conversations, messages } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { buildSystemPrompt } from '@/lib/system-prompt';

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

    // Determine conversation context
    const contextType = candidateId ? 'candidate' : 'decision';
    const contextId = candidateId || decisionId;

    // Find or create conversation
    let [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.contextType, contextType),
          eq(conversations.contextId, contextId),
        ),
      );

    if (!conversation) {
      const convId = nanoid();
      await db.insert(conversations).values({
        id: convId,
        contextType,
        contextId,
        createdAt: new Date(),
      });
      [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, convId));
    }

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

    // Save the latest user message to DB (only the last one, which is the new user message)
    const latestUserMessage = chatMessages.filter((m) => m.role === 'user').pop();
    if (latestUserMessage) {
      await db.insert(messages).values({
        id: nanoid(),
        conversationId: conversation.id,
        role: 'user',
        content: latestUserMessage.content,
        createdAt: new Date(),
      });
    }

    // Build AI SDK messages, excluding system role from history
    const aiMessages = chatMessages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Determine model
    const modelId = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    // Stream the response
    const result = streamText({
      model: openai(modelId),
      system: systemPrompt + scopeContext,
      messages: aiMessages,
      onFinish: async ({ text }) => {
        // Save assistant response to DB after streaming completes
        if (text) {
          await db.insert(messages).values({
            id: nanoid(),
            conversationId: conversation.id,
            role: 'assistant',
            content: text,
            createdAt: new Date(),
          });
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