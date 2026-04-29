import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import type { Page } from 'playwright';
import * as fs from 'fs/promises';
import { BROWSER_TOOL } from './browser';
import { LOGS_DIR } from '../db';

export const MODEL = 'claude-sonnet-4-6';
export const MAX_TURNS = 20;
export const DEBUG = process.env.DEBUG === '1';
const MAX_SNAPSHOTS_PER_HOST = 100;

export function debug(...args: unknown[]): void {
  if (DEBUG) console.log(...args);
}

const client = new Anthropic();

export interface ToolDone<T> {
  done: true;
  value: T;
  content: string;
}

export function toolDone<T>(value: T, content: string): ToolDone<T> {
  return { done: true, value, content };
}

function isDone<T>(r: string | ToolDone<T>): r is ToolDone<T> {
  return typeof r !== 'string';
}

function snapshotHostPrefix(filename: string): string | null {
  const match = filename.match(/^(.*)_\d+_\d{3}\.txt$/);
  return match ? match[1] : null;
}

async function pruneSnapshotsForHost(hostPrefix: string): Promise<void> {
  const entries = await fs.readdir(LOGS_DIR, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => snapshotHostPrefix(name) === hostPrefix)
    .sort()
    .reverse();

  for (const name of files.slice(MAX_SNAPSHOTS_PER_HOST)) {
    await fs.unlink(`${LOGS_DIR}/${name}`).catch(() => {});
  }
}

export async function runAgent<T>(
  page: Page,
  tools: Tool[],
  systemPrompt: string,
  initialMessage: string,
  onTool: (name: string, input: Record<string, unknown>, page: Page) => Promise<string | ToolDone<T>>,
): Promise<T> {
  const messages: MessageParam[] = [{ role: 'user', content: initialMessage }];
  const hostPrefix = new URL(page.url()).hostname.replace(/\./g, '_');
  const sessionTag = hostPrefix + '_' + Date.now();
  let snapCount = 0;
  await fs.mkdir(LOGS_DIR, { recursive: true });

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
    // tool_choice: 'any' guarantees at least one tool call per response.
    if (toolUses.length === 0) throw new Error('unexpected: Claude returned no tool calls');

    const toolResults: { type: 'tool_result'; tool_use_id: string; content: string }[] = [];
    let result: { value: T } | undefined;

    for (const toolUse of toolUses) {
      // Stub any tool_use blocks that follow the terminal tool — the API requires
      // one tool_result per tool_use in the conversation history.
      if (result) {
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'skipped' });
        continue;
      }

      console.log(`🔄 ${turn + 1}/${MAX_TURNS} 🔧 ${toolUse.name}`, toolUse.input);

      let output = '';
      try {
        const r = await onTool(toolUse.name, toolUse.input as Record<string, unknown>, page);
        if (isDone(r)) {
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: r.content });
          result = { value: r.value };
          continue;
        }
        output = r;

        const preview = output.length > 240 ? output.slice(0, 240) + '…' : output;
        if (toolUse.name === BROWSER_TOOL.SNAPSHOT) {
          const file = `${LOGS_DIR}/${sessionTag}_${String(++snapCount).padStart(3, '0')}.txt`;
          await fs.writeFile(file, output);
          await pruneSnapshotsForHost(hostPrefix);
          console.log(`✅ snapshot taken:\n${preview}\nSee full snapshot in ${file}`);
        } else {
          console.log(`✅ ${preview}`);
        }
        
      } catch (err) {
        output = `error: ${err instanceof Error ? err.message : String(err)}`;
        const preview = output.length > 480 ? output.slice(0, 480) + '…' : output;
        // Playwright errors contain ANSI colour codes; the reset prevents terminal colour bleed.
        console.log(`❌ ${preview}\x1b[0m`);
      }
      
      if (DEBUG) await new Promise(resolve => setTimeout(resolve, 1000));
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: output });
    }

    messages.push({ role: 'user', content: toolResults });

    if (result) return result.value;
  }

  throw new Error(`agent did not complete within ${MAX_TURNS} turns`);
}
