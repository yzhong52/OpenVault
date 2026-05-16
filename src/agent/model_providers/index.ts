export type { ProviderCallParams, ProviderResponse } from './types';

import { callAnthropic, callAnthropicSimple } from './anthropic';
import { callOllama, callOllamaSimple } from './ollama';
import type { ProviderCallParams, ProviderResponse } from './types';

export function isAnthropicModel(model: string): boolean {
  return model.startsWith('claude-');
}

// TODO: add isOpenAIModel() here and route to openai.ts once that provider is tested.
// OpenAI model IDs typically start with 'gpt-' or 'o1'/'o3'.

export async function callModel(params: ProviderCallParams): Promise<ProviderResponse> {
  if (isAnthropicModel(params.model)) return callAnthropic(params);
  return callOllama(params);
}

export async function callModelSimple(model: string, userMessage: string): Promise<string> {
  if (isAnthropicModel(model)) return callAnthropicSimple(model, userMessage);
  return callOllamaSimple(model, userMessage);
}
