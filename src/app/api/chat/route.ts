import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { getDatabase } from '@/db';
import { decisions, candidates, messages } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { buildSystemPrompt } from '@/lib/system-prompt';
import { getAIModel } from '@/lib/ai/provider';
import { assembleContext } from '@/lib/ai/context-assembler';
import { generateDecisionSummary } from '@/lib/ai/summarizer';
import { maybeCompress } from '@/lib/ai/context-compressor';
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

    const [decision] = await db.select().from(decisions).where(eq(decisions.id, decisionId));
    if (!decision) {
      return new Response(JSON.stringify({ error: 'Decision not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const decisionCandidates = await db
      .select()
      .from(candidates)
      .where(eq(candidates.decisionId, decisionId));

    const ctx = await assembleContext(decisionId, candidateId);
    const { conversationId } = ctx;

    // Save latest user message to DB
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

    // ── Build message list: DB history + current user message ──
    const dbHistory = ctx.recentMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Prefer client-sent messages (includes current turn), fallback to DB
    const historyMessages =
      chatMessages.length > 0
        ? chatMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        : dbHistory;

    // ── Context Compression ──
    const { summary: compressedSummary } = await maybeCompress(historyMessages);

    // Build system prompt
    const systemPrompt = buildSystemPrompt(
      { decision, candidates: decisionCandidates },
      compressedSummary || undefined,
    );

    // Candidate scope
    let scopeContext = '';
    if (candidateId) {
      const targetCandidate = decisionCandidates.find((c) => c.id === candidateId);
      if (targetCandidate) {
        scopeContext = `\n\nThe user is focused on candidate: **${targetCandidate.name}** (ID: ${targetCandidate.id}).${targetCandidate.currentFormSummary ? ` Summary: ${targetCandidate.currentFormSummary}` : ''}`;
      }
    }

    // Pinned messages
    let pinnedContext = '';
    if (ctx.pinnedMessages.length > 0) {
      pinnedContext =
        '\n\n## Pinned Messages\n' +
        ctx.pinnedMessages.map((m) => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n');
    }

    // Stream
    const result = streamText({
      model: getAIModel(),
      system: systemPrompt + scopeContext + pinnedContext,
      messages: historyMessages,
      onFinish: async ({ text }) => {
        if (text) {
          await db.insert(messages).values({
            id: nanoid(),
            conversationId,
            role: 'assistant',
            content: text,
            createdAt: new Date(),
          });

          try {
            const allMsgs = await db
              .select({ id: messages.id })
              .from(messages)
              .where(eq(messages.conversationId, conversationId));
            if (allMsgs.length % 5 === 0) {
              generateDecisionSummary(decisionId).catch((err) =>
                console.error('[/api/chat] generateDecisionSummary error:', err),
              );
            }
          } catch {
            // ignore
          }
        }
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('[/api/chat] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
