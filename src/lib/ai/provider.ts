/**
 * AI provider interface — returns a Vercel AI SDK model instance.
 * Reads from env vars:
 *   AI_PROVIDER      → "openai" (default) | "anthropic"
 *   OPENAI_API_KEY   → required for openai
 *   OPENAI_MODEL     → default "gpt-4o-mini"
 *   ANTHROPIC_API_KEY → required for anthropic
 *   ANTHROPIC_MODEL  → default "claude-3-5-haiku-20241022"
 */

import 'dotenv/config';

type AIModel = Parameters<typeof import('ai').generateText>[0]['model'];

export function getAIModel(): AIModel {
  const provider = (process.env.AI_PROVIDER ?? 'openai').toLowerCase();

  if (provider === 'anthropic') {
    // Dynamic import so OpenAI-only deployments don't fail
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { anthropic } = require('@ai-sdk/anthropic') as typeof import('@ai-sdk/anthropic');
    const modelId = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-20241022';
    return anthropic(modelId);
  }

  // Default: OpenAI
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { openai } = require('@ai-sdk/openai') as typeof import('@ai-sdk/openai');
  const modelId = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  return openai(modelId);
}
