/**
 * Context assembly engine.
 * Fetches all relevant data for a conversation from the DB and packages it
 * for the AI system prompt and message history.
 */

import 'dotenv/config';
import { eq, and } from 'drizzle-orm';
import { getDatabase } from '@/db';
import * as s from '@/db/schema';
import {
  getDecision,
  listCandidates,
  listConversations,
  listMessages,
  createConversation,
} from '@/db/helpers';

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

import type { InferSelectModel } from 'drizzle-orm';

type Decision = InferSelectModel<typeof s.decisions>;
type Candidate = InferSelectModel<typeof s.candidates>;
type Message = InferSelectModel<typeof s.messages>;
type Pin = InferSelectModel<typeof s.pins>;

export interface AssembledContext {
  decision: Decision;
  candidates: Candidate[];
  conversationId: string;
  contextType: 'decision' | 'candidate';
  contextId: string;
  /** Pinned messages in scope (from the conversation) */
  pinnedMessages: (Message & { pin: Pin })[];
  /** Last N messages from the conversation (default 20) */
  recentMessages: Message[];
}

// ─────────────────────────────────────────────────
// assembleContext
// ─────────────────────────────────────────────────

/**
 * Assemble everything the AI needs for one conversation turn.
 *
 * @param decisionId  - Always required.
 * @param candidateId - Optional. When provided, narrows context to that candidate's conversation.
 * @param maxRecent   - Max recent messages to include (default 20).
 */
export async function assembleContext(
  decisionId: string,
  candidateId?: string,
  maxRecent = 20,
): Promise<AssembledContext> {
  const { db } = getDatabase();

  // 1. Decision + candidates
  const decision = await getDecision(decisionId);
  if (!decision) {
    throw new Error(`assembleContext: decision ${decisionId} not found`);
  }
  const candidates = await listCandidates(decisionId);

  // 2. Resolve conversation context
  const contextType: 'decision' | 'candidate' = candidateId ? 'candidate' : 'decision';
  const contextId = candidateId ?? decisionId;

  // Find or create conversation
  const existing = await listConversations(contextType, contextId);
  let conversationId: string;

  if (existing.length > 0) {
    conversationId = existing[0].id;
  } else {
    const conv = await createConversation({ contextType, contextId });
    conversationId = conv.id;
  }

  // 3. Pinned messages: join messages → pins for this conversation
  const pinnedRows = await db
    .select({
      id: s.messages.id,
      conversationId: s.messages.conversationId,
      role: s.messages.role,
      content: s.messages.content,
      sourceLinks: s.messages.sourceLinks,
      createdAt: s.messages.createdAt,
      pin: {
        id: s.pins.id,
        messageId: s.pins.messageId,
        createdAt: s.pins.createdAt,
      },
    })
    .from(s.messages)
    .innerJoin(s.pins, eq(s.pins.messageId, s.messages.id))
    .where(eq(s.messages.conversationId, conversationId));

  // 4. Recent messages (last N ordered by createdAt asc)
  const allMessages = await listMessages(conversationId);
  const recentMessages = allMessages.slice(-maxRecent);

  return {
    decision,
    candidates,
    conversationId,
    contextType,
    contextId,
    pinnedMessages: pinnedRows as (Message & { pin: Pin })[],
    recentMessages,
  };
}
