/**
 * AI provider interface — returns a Vercel AI SDK model instance.
 */
import 'dotenv/config';

type AIModel = Parameters<typeof import('ai').generateText>[0]['model'];

export function getAIModel(): AIModel {
  const provider = (process.env.AI_PROVIDER ?? 'openai').toLowerCase();

  if (provider === 'anthropic') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { anthropic } = require('@ai-sdk/anthropic');
    const modelId = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-20241022';
    return anthropic(modelId);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createOpenAI } = require('@ai-sdk/openai');

  if (provider === 'deepseek') {
    const deepseek = createOpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
      compatibility: 'compatible',
    });
    const modelId = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
    return deepseek(modelId);
  }

  // Default: OpenAI
  const { openai } = require('@ai-sdk/openai');
  const modelId = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  return openai(modelId);
}
