import Anthropic from '@anthropic-ai/sdk';
import type {
  ContentBlockParam,
  MessageParam,
  Tool,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions';
import { keychainLoadApiKey } from '../keychain';

export interface ProviderResponse {
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  // Anthropic-format content blocks — used to append assistant turn to message history
  assistantContent: ToolUseBlock[];
  rawForLog: unknown;
}

export interface ProviderCallParams {
  model: string;
  maxTokens: number;
  system: string;
  tools: Tool[];
  messages: MessageParam[];    // archived turns in Anthropic format
  userContent: ContentBlockParam[]; // current user turn
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

let _anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    const apiKey = keychainLoadApiKey() ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error(
      'Anthropic API key not found. Run: npm run cli -- config anthropic',
    );
    _anthropicClient = new Anthropic({ apiKey });
  }
  return _anthropicClient;
}

async function callAnthropic(params: ProviderCallParams): Promise<ProviderResponse> {
  const response = await getAnthropicClient().messages.create({
    model: params.model,
    max_tokens: params.maxTokens,
    system: params.system,
    tools: params.tools,
    tool_choice: { type: 'any' },
    messages: [...params.messages, { role: 'user', content: params.userContent }],
  });

  const toolUses = response.content.filter(
    (b): b is ToolUseBlock => b.type === 'tool_use',
  );

  return {
    toolUses: toolUses.map(b => ({
      id: b.id,
      name: b.name,
      input: b.input as Record<string, unknown>,
    })),
    assistantContent: toolUses,
    rawForLog: response,
  };
}

// ─── Ollama / OpenAI-compatible ───────────────────────────────────────────────

let _ollamaClient: OpenAI | null = null;
function getOllamaClient(): OpenAI {
  if (!_ollamaClient) {
    _ollamaClient = new OpenAI({
      baseURL: process.env.OLLAMA_HOST ?? 'http://localhost:11434/v1',
      apiKey: 'ollama', // required by the SDK but ignored by Ollama
    });
  }
  return _ollamaClient;
}

// Convert Anthropic Tool[] → OpenAI function tools
function toOpenAITools(tools: Tool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

// Convert Anthropic MessageParam[] + current userContent to OpenAI messages.
//
// Anthropic allows a single user turn to contain both tool_result blocks and text blocks.
// OpenAI requires these to be separate messages: role:'tool' for results, role:'user' for text.
// Tool results must immediately precede the next user text message in the sequence.
function toOpenAIMessages(
  messages: MessageParam[],
  userContent: ContentBlockParam[],
  system: string,
): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [{ role: 'system', content: system }];

  function splitUserContent(blocks: ContentBlockParam[]): {
    toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[];
    textContent: string;
  } {
    const toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];
    const textParts: string[] = [];

    for (const block of blocks) {
      if (block.type === 'tool_result') {
        const content = typeof block.content === 'string'
          ? block.content
          : (block.content ?? []).find(b => b.type === 'text')?.text ?? '';
        toolResults.push({ role: 'tool', tool_call_id: block.tool_use_id, content });
      } else if (block.type === 'text') {
        textParts.push(block.text);
      }
    }

    return { toolResults, textContent: textParts.join('\n\n') };
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      const blocks = Array.isArray(msg.content)
        ? (msg.content as ContentBlockParam[])
        : [{ type: 'text' as const, text: msg.content as string }];

      const { toolResults, textContent } = splitUserContent(blocks);
      out.push(...toolResults);
      if (textContent) out.push({ role: 'user', content: textContent });

    } else if (msg.role === 'assistant') {
      const blocks = Array.isArray(msg.content) ? msg.content : [];
      const textParts: string[] = [];
      const toolCalls: ChatCompletionMessageFunctionToolCall[] = [];

      for (const block of blocks) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: (block as ToolUseBlock).id,
            type: 'function',
            function: {
              name: (block as ToolUseBlock).name,
              arguments: JSON.stringify((block as ToolUseBlock).input),
            },
          });
        }
      }

      if (toolCalls.length > 0) {
        out.push({
          role: 'assistant',
          content: textParts.join('') || null,
          tool_calls: toolCalls,
        });
      } else {
        out.push({ role: 'assistant', content: textParts.join('') });
      }
    }
  }

  // Append the current user turn
  const { toolResults, textContent } = splitUserContent(userContent);
  out.push(...toolResults);
  if (textContent) out.push({ role: 'user', content: textContent });

  return out;
}

async function callOllama(params: ProviderCallParams): Promise<ProviderResponse> {
  const messages = toOpenAIMessages(params.messages, params.userContent, params.system);
  const tools = toOpenAITools(params.tools);

  const response = await getOllamaClient().chat.completions.create({
    model: params.model,
    max_tokens: params.maxTokens,
    messages,
    tools,
    tool_choice: 'required',
  });

  const allToolCalls = response.choices[0]?.message.tool_calls ?? [];
  const rawToolCalls = allToolCalls.filter(
    (tc): tc is ChatCompletionMessageFunctionToolCall => tc.type === 'function',
  );
  if (rawToolCalls.length === 0) {
    throw new Error('unexpected: model returned no tool calls');
  }

  const toolUses = rawToolCalls.map(tc => ({
    id: tc.id,
    name: tc.function.name,
    input: (() => {
      try { return JSON.parse(tc.function.arguments) as Record<string, unknown>; }
      catch { return {} as Record<string, unknown>; }
    })(),
  }));

  // Build Anthropic-format assistant content blocks for message history
  const assistantContent: ToolUseBlock[] = toolUses.map(tu => ({
    type: 'tool_use',
    id: tu.id,
    name: tu.name,
    input: tu.input,
  }));

  return { toolUses, assistantContent, rawForLog: response };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function isAnthropicModel(model: string): boolean {
  return model.startsWith('claude-');
}

export async function callModel(params: ProviderCallParams): Promise<ProviderResponse> {
  return isAnthropicModel(params.model) ? callAnthropic(params) : callOllama(params);
}

// Thin wrapper for text-only calls (used by memory summarization).
export async function callModelSimple(model: string, userMessage: string): Promise<string> {
  if (isAnthropicModel(model)) {
    const response = await getAnthropicClient().messages.create({
      model,
      max_tokens: 512,
      messages: [{ role: 'user', content: userMessage }],
    });
    const block = response.content.find(b => b.type === 'text');
    return block?.type === 'text' ? block.text : '';
  } else {
    const response = await getOllamaClient().chat.completions.create({
      model,
      max_tokens: 512,
      messages: [{ role: 'user', content: userMessage }],
    });
    return response.choices[0]?.message.content ?? '';
  }
}
