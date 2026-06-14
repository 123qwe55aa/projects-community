/**
 * Context Compressor — automatically summarizes conversation history
 * when it exceeds token thresholds, keeping the AI context window lean.
 */

import { generateText } from 'ai';
import { getAIModel } from './provider';

type Message = { role: string; content: string };

// ─────────────────────────────────────────────────
// Token estimation (rough heuristic)
// ─────────────────────────────────────────────────

const CHARS_PER_TOKEN = 3; // rough: ~3 chars per token for mixed EN/ZH

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function totalTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

// ─────────────────────────────────────────────────
// Compression
// ─────────────────────────────────────────────────

const COMPRESS_THRESHOLD = 5000; // tokens — trigger compression
const KEEP_RECENT = 8; // keep last N messages intact

/**
 * Check if compression is needed and generate a summary if so.
 *
 * @returns { summary, compressed } — summary string (empty if no compression),
 *          and whether compression was applied.
 */
export async function maybeCompress(
  messages: Message[],
): Promise<{ summary: string; compressed: boolean }> {
  if (messages.length <= KEEP_RECENT) {
    return { summary: '', compressed: false };
  }

  const tokens = totalTokens(messages);
  if (tokens < COMPRESS_THRESHOLD) {
    return { summary: '', compressed: false };
  }

  // Split: older messages to summarize, recent ones to keep
  const olderMessages = messages.slice(0, messages.length - KEEP_RECENT);

  if (olderMessages.length === 0) {
    return { summary: '', compressed: false };
  }

  try {
    const summary = await generateSummary(olderMessages);
    return { summary, compressed: true };
  } catch (err) {
    console.error('[context-compressor] Compression failed:', err);
    return { summary: '', compressed: false };
  }
}

/**
 * Generate a concise summary of older conversation messages.
 */
async function generateSummary(messages: Message[]): Promise<string> {
  const conversation = messages
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n\n');

  const prompt = `Summarize the following conversation into a concise paragraph (max 200 words). Focus on:
- Key decisions and conclusions reached
- Important facts and data points mentioned
- Open questions still being discussed
- User's stated preferences and priorities

Do NOT include: greetings, filler, or meta-commentary about the conversation itself.

Conversation:
${conversation}

Summary:`;

  const model = getAIModel();
  const result = await generateText({
    model,
    prompt,
    maxTokens: 400,
  });

  return result.text.trim();
}
