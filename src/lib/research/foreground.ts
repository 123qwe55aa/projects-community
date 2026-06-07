/**
 * Foreground research — creates a job and blocks until it completes.
 *
 * Use this when the caller needs the results immediately before continuing.
 */

import { createResearchJob } from '@/db/helpers';
import { executeResearchJob } from './executor';

// ─────────────────────────────────────────────────
// runForegroundResearch
// ─────────────────────────────────────────────────

/**
 * Create a research job and wait for it to finish before returning.
 *
 * @returns { jobId, results } — results is the raw JSON string stored in the DB.
 * @throws if job creation fails; executor errors are swallowed per executor contract.
 */
export async function runForegroundResearch(
  conversationId: string,
  query: string,
): Promise<{ jobId: string; results: string }> {
  // 1. Create job record
  const job = await createResearchJob({ conversationId, query });

  // 2. Execute synchronously (blocking)
  await executeResearchJob(job.id);

  // 3. Return jobId + whatever results were stored
  //    The executor guarantees to have written results or error into the DB.
  //    We return the results field; callers should handle null/empty gracefully.
  return {
    jobId: job.id,
    results: job.results ?? '',
  };
}
