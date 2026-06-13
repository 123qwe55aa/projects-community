import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDatabase } from '@/db';
import { decisions, candidates, messages, conversations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ChatInterface } from './chat-interface';

export const metadata = {
  title: 'Decision Chat',
};

export default async function DecisionChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ candidate?: string }>;
}) {
  const { id: decisionId } = await params;
  const { candidate: candidateId } = await searchParams;
  const { db } = getDatabase();

  // Fetch decision
  const [decision] = await db.select().from(decisions).where(eq(decisions.id, decisionId));
  if (!decision) {
    notFound();
  }

  // Fetch candidates for this decision
  const decisionCandidates = await db
    .select()
    .from(candidates)
    .where(eq(candidates.decisionId, decisionId))
    .orderBy(candidates.createdAt);

  // Find or create conversation
  const contextType = candidateId ? 'candidate' : 'decision';
  const contextId = candidateId || decisionId;

  const existingConversations = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.contextType, contextType),
        eq(conversations.contextId, contextId),
      ),
    );

  let conversationId: string;

  if (existingConversations.length > 0) {
    conversationId = existingConversations[0].id;
  } else {
    conversationId = nanoid();
    await db.insert(conversations).values({
      id: conversationId,
      contextType,
      contextId,
      createdAt: new Date(),
    });
  }

  // Load existing messages for this conversation
  const existingMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  // Serialize for client
  const serializedDecision = {
    id: decision.id,
    question: decision.question,
    state: decision.state,
    scope: decision.scope,
    dimensions: decision.dimensions,
    weights: decision.weights,
    projectId: decision.projectId,
  };

  const serializedCandidates = decisionCandidates.map((c) => ({
    id: c.id,
    name: c.name,
    currentFormSummary: c.currentFormSummary,
    decisionId: c.decisionId,
  }));

  const serializedMessages = existingMessages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt?.toISOString() ?? null,
  }));

  return (
    <div className="flex flex-1 flex-col min-h-0 mx-auto w-full" style={{ height: 'calc(100dvh - 3rem)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
        <Link
          href={`/decisions/${decisionId}`}
          className="text-zinc-500 hover:text-zinc-300 transition text-sm"
        >
          ← Back
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-white truncate">
            {decision.question}
          </h1>
          <p className="text-xs text-zinc-500">
            {contextType === 'candidate' && candidateId
              ? `Candidate chat — ${decisionCandidates.find((c) => c.id === candidateId)?.name ?? 'Unknown'}`
              : 'Decision chat'}
          </p>
        </div>
      </div>

      {/* Chat interface (client component) */}
      <ChatInterface
        decisionId={decisionId}
        decision={serializedDecision}
        candidates={serializedCandidates}
        conversationId={conversationId}
        initialMessages={serializedMessages}
        activeCandidateId={candidateId ?? null}
      />
    </div>
  );
}
