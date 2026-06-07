'use server';

/**
 * Server actions for research job management.
 *
 * - requestResearchAction  — kick off a background research job
 * - checkResearchStatusAction — poll job status by ID
 */

import { startBackgroundResearch, getJobStatus } from '@/lib/research/background';

// ─────────────────────────────────────────────────
// requestResearchAction
// ─────────────────────────────────────────────────

/**
 * Start a background research job.
 *
 * FormData fields:
 *   conversationId — required
 *   query          — required
 *
 * @returns { jobId } on success, { error } on validation failure.
 */
export async function requestResearchAction(
  formData: FormData,
): Promise<{ jobId: string } | { error: string }> {
  const conversationId = formData.get('conversationId') as string | null;
  const query = formData.get('query') as string | null;

  if (!conversationId?.trim()) {
    return { error: 'conversationId is required' };
  }
  if (!query?.trim()) {
    return { error: 'query is required' };
  }

  const jobId = await startBackgroundResearch(conversationId.trim(), query.trim());
  return { jobId };
}

// ─────────────────────────────────────────────────
// checkResearchStatusAction
// ─────────────────────────────────────────────────

export interface ResearchStatusResult {
  status: string;
  results?: string | null;
  error?: string | null;
}

/**
 * Check the status of a research job.
 *
 * @returns status info, or { error } if the job was not found.
 */
export async function checkResearchStatusAction(
  jobId: string,
): Promise<ResearchStatusResult | { error: string }> {
  if (!jobId?.trim()) {
    return { error: 'jobId is required' };
  }

  try {
    const result = await getJobStatus(jobId.trim());
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
