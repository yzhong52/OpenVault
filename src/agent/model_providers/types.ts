import type { ContentBlockParam, MessageParam, Tool, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';

export interface ProviderResponse {
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  // Anthropic-format content blocks — used to append the assistant turn to message history
  assistantContent: ToolUseBlock[];
  rawForLog: unknown;
}

export interface ProviderCallParams {
  model: string;
  maxTokens: number;
  system: string;
  tools: Tool[];
  messages: MessageParam[];         // archived turns in Anthropic format
  userContent: ContentBlockParam[]; // current user turn
}
