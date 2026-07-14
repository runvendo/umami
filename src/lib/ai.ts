import { createAnthropic } from '@ai-sdk/anthropic';

// vendo init starter: swap for any ai-SDK provider (BYO-LLM, 09 §2).
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export const model = anthropic('claude-sonnet-4-6');
