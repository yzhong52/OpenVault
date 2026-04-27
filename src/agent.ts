import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import type { Page } from 'playwright';

export const MODEL = 'claude-sonnet-4-6';
export const MAX_TURNS = 20;
export const DEBUG = process.env.DEBUG === '1';

export function debug(...args: unknown[]): void {
  if (DEBUG) console.log(...args);
}

export interface ToolDone<T> {
  done: true;
  value: T;
  content: string;
}

export function toolDone<T>(value: T, content: string): ToolDone<T> {
  return { done: true, value, content };
}

function isDone<T>(r: string | ToolDone<T>): r is ToolDone<T> {
  return typeof r === 'object' && (r as ToolDone<T>).done === true;
}

export async function runAgent<T>(
  page: Page,
  tools: Tool[],
  systemPrompt: string,
  initialMessage: string,
  onTool: (name: string, input: Record<string, unknown>, page: Page) => Promise<string | ToolDone<T>>,
): Promise<T> {
  const client = new Anthropic();
  const messages: MessageParam[] = [{ role: 'user', content: initialMessage }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    debug('\n── prompt to claude ──────────────────────────────');
    debug(JSON.stringify(messages[messages.length - 1], null, 2));
    debug('──────────────────────────────────────────────────\n');

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      tool_choice: { type: 'any' },
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) break;

    const toolResults: { type: 'tool_result'; tool_use_id: string; content: string }[] = [];
    let result: { value: T } | undefined;

    for (const toolUse of toolUses) {
      console.log(`[turn ${turn + 1}/${MAX_TURNS}] [tool] ${toolUse.name}`, toolUse.input);

      let output: string;
      try {
        const r = await onTool(toolUse.name, toolUse.input as Record<string, unknown>, page);
        if (isDone(r)) {
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: r.content });
          result = { value: r.value };
          break;
        }
        output = r;
      } catch (err) {
        output = `error: ${err instanceof Error ? err.message : String(err)}`;
      }

      console.log(`[turn ${turn + 1}/${MAX_TURNS}] [tool] → ${output.length > 120 ? output.slice(0, 120) + '…' : output}`);
      if (DEBUG) await new Promise(resolve => setTimeout(resolve, 1000));
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: output });
    }

    messages.push({ role: 'user', content: toolResults });

    if (result) return result.value;
  }

  throw new Error(`agent did not complete within ${MAX_TURNS} turns`);
}
