/**
 * Background research — creates a job and fires it asynchronously.
 *
 * Use this when the caller should not wait for the AI call to complete.
 * The job ID is returned immediately; the caller can poll for status.
 */

import { createResearchJob, getResearchJob } from '@/db/helpers';
import { executeResearchJob } from './executor';

// ─────────────────────────────────────────────────
// startBackgroundResearch
// ─────────────────────────────────────────────────

/**
 * Create a research job and kick it off without waiting.
 *
 * @returns jobId — the caller can poll via getJobStatus(jobId).
 */
export async function startBackgroundResearch(
  conversationId: string,
  query: string,
): Promise<string> {
  // 1. Create job record synchronously so the ID is available immediately
  const job = await createResearchJob({ conversationId, query });

  // 2. Fire executor asynchronously — caller does NOT await
  //    setImmediate ensures we yield before the heavy AI work begins.
  setImmediate(() => {
    executeResearchJob(job.id).catch((err) => {
      // executeResearchJob already catches internally, but guard here just in case
      console.error(`[background] Unexpected error for job ${job.id}:`, err);
    });
  });

  // 3. Return jobId immediately
  return job.id;
}

// ─────────────────────────────────────────────────
// getJobStatus
// ─────────────────────────────────────────────────

export interface JobStatusResult {
  status: string;
  results?: string | null;
  error?: string | null;
}

/**
 * Look up the current status of a research job.
 *
 * @returns { status, results?, error? } or throws if job not found.
 */
export async function getJobStatus(jobId: string): Promise<JobStatusResult> {
  const job = await getResearchJob(jobId);

  if (!job) {
    throw new Error(`Research job ${jobId} not found`);
  }

  return {
    status: job.status,
    results: job.results ?? null,
    error: job.error ?? null,
  };
}
