/**
 * Research job executor — runs an AI research query and persists the result.
 *
 * Contract:
 *  - Marks status='running' before calling AI
 *  - On success: stores results as JSON string, marks status='completed', sets completedAt
 *  - On failure: stores error message, marks status='failed'
 *  - Does NOT throw — always catches errors and updates DB
 */

import 'dotenv/config';
import { generateText } from 'ai';
import { getAIModel } from '@/lib/ai/provider';
import {
  getResearchJob,
  updateResearchJobStatus,
} from '@/db/helpers';

// ─────────────────────────────────────────────────
// executeResearchJob
// ─────────────────────────────────────────────────

/**
 * Execute a research job by ID.
 *
 * Fetches the job record, runs AI research on the query, and writes
 * results (or error) back to the DB. Never throws.
 */
export async function executeResearchJob(jobId: string): Promise<void> {
  // 1. Fetch job record
  const job = await getResearchJob(jobId).catch((err) => {
    console.error(`[executor] Failed to fetch research job ${jobId}:`, err);
    return null;
  });

  if (!job) {
    console.error(`[executor] Research job ${jobId} not found — aborting`);
    return;
  }

  // 2. Mark as running
  try {
    await updateResearchJobStatus(jobId, { status: 'running' });
  } catch (err) {
    console.error(`[executor] Failed to mark job ${jobId} as running:`, err);
    // Continue anyway — don't abandon the work over a status update failure
  }

  // 3. Run AI research
  try {
    const { text } = await generateText({
      model: getAIModel(),
      prompt: buildResearchPrompt(job.query),
      maxTokens: 2000,
    });

    // 4a. Persist success
    const results = JSON.stringify({ summary: text });
    await updateResearchJobStatus(jobId, {
      status: 'completed',
      results,
    });
  } catch (err) {
    // 4b. Persist failure
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[executor] Research job ${jobId} failed:`, err);

    try {
      await updateResearchJobStatus(jobId, {
        status: 'failed',
        error: errorMessage,
      });
    } catch (updateErr) {
      console.error(`[executor] Failed to persist error for job ${jobId}:`, updateErr);
    }
  }
}

// ─────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────

function buildResearchPrompt(query: string): string {
  return `You are a research assistant helping with architectural and technical decisions.

Research query: "${query}"

Provide a concise, factual research summary (max 500 words) that:
1. Directly addresses the query
2. Covers key facts, trade-offs, and relevant considerations
3. Cites any relevant context (industry patterns, known constraints, etc.)
4. Marks uncertain claims explicitly with "Note: uncertain —"

No editorializing. Factual only. No recommendations unless explicitly asked.`;
}
