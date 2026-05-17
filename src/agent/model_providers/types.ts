import type { ContentBlockParam, MessageParam, TextBlock, Tool, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';

export interface ProviderResponse {
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  // Anthropic-format content blocks — used to append the assistant turn to message history.
  // Includes text blocks so any reasoning the model writes is preserved in history.
  assistantContent: (TextBlock | ToolUseBlock)[];
  rawForLog: unknown;
}

export interface ProviderCallParams {
  model: string;
  maxTokens: number;
  system: string;
  tools: Tool[];
  prevMessages: MessageParam[];       // archived turns in Anthropic format
  currentMessage: ContentBlockParam[]; // current user turn
}
