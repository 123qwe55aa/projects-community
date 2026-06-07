import { getDatabase } from '@/db';
import { messages, pins, conversations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

interface PinnedMessagesProps {
  decisionId: string;
}

export async function PinnedMessages({ decisionId }: PinnedMessagesProps) {
  const { db } = getDatabase();

  // Find the decision conversation
  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.contextType, 'decision'),
        eq(conversations.contextId, decisionId)
      )
    );

  const pinnedRows = conv
    ? await db
        .select({
          id: messages.id,
          role: messages.role,
          content: messages.content,
          createdAt: messages.createdAt,
          pinId: pins.id,
          pinnedAt: pins.createdAt,
        })
        .from(messages)
        .innerJoin(pins, eq(pins.messageId, messages.id))
        .where(eq(messages.conversationId, conv.id))
    : [];

  const roleIcon: Record<string, string> = {
    user: '👤',
    assistant: '🤖',
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
      <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide flex items-center gap-2">
        <span>📌</span> Pinned Messages
      </h2>

      {pinnedRows.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">
          Pin messages during research to keep key findings visible.
        </p>
      ) : (
        <ul className="space-y-2">
          {pinnedRows.map((row) => {
            const truncated =
              row.content.length > 100 ? row.content.slice(0, 100) + '…' : row.content;
            const date = row.createdAt
              ? new Date(row.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })
              : '';
            return (
              <li
                key={row.id}
                className="rounded-md border border-zinc-800 bg-zinc-900 p-3 space-y-1"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs">{roleIcon[row.role] ?? '💬'}</span>
                  <span className="text-xs text-zinc-500 capitalize">{row.role}</span>
                  {date && <span className="ml-auto text-xs text-zinc-600">{date}</span>}
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">{truncated}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
