import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { Session } from '../browser/session';
import { TOOLS, executeTool, type ToolCall } from './tools';

const MODEL = 'claude-opus-4-6';
const MAX_TURNS = 50;

export class Agent {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async run(task: string, session: Session): Promise<string> {
    const initialSnapshot = await session.snapshot();
    const system = [
      'You are an agent controlling a web browser to extract financial data.',
      'Use the provided tools to navigate and interact with the page.',
      'Use element refs like @e1, @e2 to target elements.',
      'Call `snapshot` after navigation or actions to see the updated page state.',
      'When you have retrieved all requested data, call the `done` tool.',
      '',
      'Current page accessibility snapshot:',
      initialSnapshot,
    ].join('\n');

    const messages: MessageParam[] = [{ role: 'user', content: task }];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system,
        tools: TOOLS,
        tool_choice: { type: 'any' },
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      const toolUse = response.content.find(b => b.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') {
        const text = response.content.find(b => b.type === 'text');
        return text?.type === 'text' ? text.text : '';
      }

      const call: ToolCall = {
        id: toolUse.id,
        name: toolUse.name,
        input: toolUse.input as Record<string, unknown>,
      };

      if (call.name === 'done') {
        return (call.input.result as string) ?? '';
      }

      let output: string;
      try {
        output = await executeTool(call, session);
      } catch (err) {
        output = `error: ${err instanceof Error ? err.message : String(err)}`;
      }

      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: call.id, content: output }],
      });
    }

    throw new Error(`agent exceeded ${MAX_TURNS} turns without completing`);
  }
}
