// OpenAI provider — not yet implemented.
//
// When ready, wire up getClient() using process.env.OPENAI_API_KEY (or Keychain),
// then reuse toOpenAITools / toOpenAIMessages from ollama.ts (they already speak
// the OpenAI Chat Completions format). The main difference from Ollama will be the
// baseURL (api.openai.com) and stricter tool_choice:'required' support.
//
// Routing: add an isOpenAIModel() check in index.ts before the Ollama fallback.

import type { ProviderCallParams, ProviderResponse } from './types';

export async function callOpenAI(_params: ProviderCallParams): Promise<ProviderResponse> {
  throw new Error('OpenAI provider is not yet implemented.');
}

export async function callOpenAISimple(_model: string, _message: string): Promise<string> {
  throw new Error('OpenAI provider is not yet implemented.');
}
