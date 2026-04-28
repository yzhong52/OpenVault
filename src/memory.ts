import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DATA_DIR } from './db';
import { MODEL } from './agent';

export interface LoginMemory {
  notes: string;
}

export interface ToolEvent {
  description: string;
  outcome: 'success' | 'error';
  error?: string;
}

function memoryPath(institutionName: string): string {
  const slug = institutionName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return path.join(DATA_DIR, 'memory', `${slug}.json`);
}

export async function loadLoginMemory(institutionName: string): Promise<LoginMemory> {
  try {
    const raw = JSON.parse(await fs.readFile(memoryPath(institutionName), 'utf-8'));
    return { notes: raw.notes ?? '' };
  } catch {
    return { notes: '' };
  }
}

export async function saveLoginMemory(institutionName: string, memory: LoginMemory): Promise<void> {
  if (!memory.notes) return;
  const dir = path.join(DATA_DIR, 'memory');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(memoryPath(institutionName), JSON.stringify(memory, null, 2) + '\n');
}

export function formatMemoryForPrompt(memory: LoginMemory): string {
  if (!memory.notes) return '';
  return `\nNotes from previous sessions for this institution:\n${memory.notes}`;
}

export async function generateSessionNotes(events: ToolEvent[]): Promise<string> {
  const transcript = events
    .map(e => `- ${e.description}: ${e.outcome === 'error' ? `FAILED (${e.error})` : 'ok'}`)
    .join('\n');

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are reviewing a browser automation session that logged into a financial institution website. Here is the sequence of actions taken:\n\n${transcript}\n\nWrite 3-5 concise bullet points capturing:\n- Which selectors or tools worked well and should be tried first next time\n- Which failed and what succeeded instead\n- Any unusual flows encountered (MFA, device trust prompts, etc.)\n\nBe specific about element names and tools used. These notes will be injected into the next login session's system prompt to help avoid repeating mistakes.`,
    }],
  });

  const block = response.content.find(b => b.type === 'text');
  return block ? block.text.trim() : '';
}
