import type { ContentBlockParam, MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import type { Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BROWSER_TOOL, SUCCESS_TOOL } from './tools';
import { redact } from './redact';
export { SUCCESS_TOOL } from './tools';
import { LOGS_DIR } from '../db';
import { callWithTools } from './model_providers';

export const MAX_TURNS = 20;
export const SEPARATOR = '─'.repeat(60);

function briefInput(input: Record<string, unknown>): string {
  if (input.role && input.name) return `${input.role} "${input.name}"`;
  if (input.testId)   return `#${input.testId}`;
  if (input.text)     return `"${input.text}"`;
  if (input.selector) return `"${input.selector}"`;
  if (Array.isArray(input.transactions)) return `(${input.transactions.length} items)`;
  if (Array.isArray(input.accounts))     return `(${input.accounts.length} items)`;
  return '';
}
export const VERBOSE = process.env.VERBOSE === '1';
const MAX_LOG_SESSIONS = 20;



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

// Archives the previous page snapshot as a brief summary written by the agent
// itself. The agent is instructed (via the system prompt augmentation below) to
// open each response with a one-sentence page summary before its tool calls;
// that text is captured here so the agent can recall which pages it has visited
// and what data it saw, preventing navigation flip-flopping.
// Falls back to a raw truncation when the model produced no text.
function archiveSnapshot(responseText: string, snap: string): { type: 'text'; text: string } {
  if (responseText) return { type: 'text', text: `[prev page summary]\n${responseText}` };
  const stripped = snap.replace(/\s*\[ref=\w+\]/g, '');
  const preview = stripped.length > 800 ? stripped.slice(0, 800) + '\n…' : stripped;
  return { type: 'text', text: `[prev page state]\n${preview}` };
}

function pageStateMessage(snap: string): { type: 'text'; text: string } {
  return { type: 'text', text: `Current page state:\n${snap}` };
}

function sessionTimestamp(folderName: string): string | null {
  const timestampFirst = folderName.match(/^(\d{4}-\d{2}-\d{2}_\d{6}(?:_\d{3})?)_/);
  if (timestampFirst) return timestampFirst[1];

  const legacyTimestampLast = folderName.match(/_(\d{4}-\d{2}-\d{2}_\d{6})$/);
  return legacyTimestampLast ? legacyTimestampLast[1] : null;
}

function slugifyLogName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'unknown_institution';
}

async function pruneLogSessions(): Promise<void> {
  const entries = await fs.readdir(LOGS_DIR, { withFileTypes: true }).catch(() => []);
  const folders = entries
    .filter(e => e.isDirectory())
    .map(e => ({ name: e.name, timestamp: sessionTimestamp(e.name) }))
    .filter((e): e is { name: string; timestamp: string } => e.timestamp !== null)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  for (const { name } of folders.slice(MAX_LOG_SESSIONS)) {
    await fs.rm(`${LOGS_DIR}/${name}`, { recursive: true }).catch(() => {});
  }
}

export async function createSession(institutionName: string): Promise<string> {
  const institutionSlug = slugifyLogName(institutionName);
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  const sessionDir = `${LOGS_DIR}/${date}_${time}_${milliseconds}_${institutionSlug}`;
  await fs.mkdir(sessionDir, { recursive: true });
  await pruneLogSessions();
  return sessionDir;
}

function snapshotPrefix(logName: string): string {
  return logName.replace(/^conversation_/, 'snapshot_');
}

// T is the task's return type — e.g. Account[] for exploreAccounts, void for login.
//
// systemPrompt: persistent instructions passed via the `system` API parameter, visible on every
//   turn but outside the conversation history. Holds task description and memory notes.
//   Example: "You are a browser agent. Use fill_credential to fill in credentials. Call success()
//   once the dashboard is visible."
//
// initialMessage: the first user-role message that starts the conversation, combined internally
//   with the initial ARIA snapshot of the page.
//   Example: "The browser has navigated to the login page."
//
// onTool: called for each tool use Claude returns. Return a plain string to feed the result back
//   to Claude, or toolDone(value) to signal completion and carry the final value out of the loop.
//
// sensitiveValues: exact strings to redact from snapshots, tool results, and logs before they
//   are sent back to the model or written to disk.
export async function runAgent<T>(
  page: Page,
  tools: Tool[],
  systemPrompt: string,
  initialMessage: string,
  onTool: (
    name: string,
    input: Record<string, unknown>,
    page: Page,
  ) => Promise<string | ToolDone<T>>,
  sessionDir: string,
  logName: string,
  sensitiveValues: string[] = [],
  maxTurns: number,
  maxTokens: number,
  model: string,
): Promise<T> {
  let snapCount = 0;
  const redactSensitive = (text: string) => redact(text, sensitiveValues);
  const snapshotsDir = `${sessionDir}/snapshots`;
  const snapPrefix = snapshotPrefix(logName);
  await fs.mkdir(snapshotsDir, { recursive: true });

  async function takeSnapshot(): Promise<{ snap: string; snapFile: string }> {
    // Wait for the page to settle before snapshotting. Without this, a snapshot taken
    // immediately after a click (e.g. clicking Log In) captures the pre-navigation DOM
    // because domcontentloaded fires before the new page finishes rendering — causing the
    // agent to see the login page again and incorrectly infer that MFA is needed.
    // 8s covers slow SPA login API calls (e.g. Wealthsimple); if the page stays busy
    // past that we snapshot anyway rather than blocking indefinitely.
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    let snap: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        snap = await page.locator('body').ariaSnapshot({ mode: 'ai' });
        break;
      } catch {
        if (attempt < 2) await new Promise(r => setTimeout(r, 500));
      }
    }
    if (snap === null) throw new Error('Could not snapshot page after 3 attempts');
    snap = redactSensitive(snap);
    const snapFile = `${snapshotsDir}/${snapPrefix}_${String(++snapCount).padStart(3, '0')}.txt`;
    await fs.writeFile(snapFile, snap);
    if (VERBOSE) {
      const preview = snap.length > 240 ? snap.slice(0, 240) + '…' : snap;
      console.log(`📸 Snapshot:\n${preview}\nFull: ${snapFile}`);
    } else {
      console.log(`📸 Snapshot`);
    }
    return { snap, snapFile };
  }

  // messages holds compressed history. pendingPrefix is the non-snapshot content for the next
  // user turn (initial message block, or tool results). At the top of each turn a snapshot is
  // taken and appended to form the live userContent sent to the API; the archived message gets
  // the agent's page summary instead of the full snapshot.
  const messages: MessageParam[] = [];
  const initialBlock = { type: 'text' as const, text: initialMessage };
  let pendingPrefix: ContentBlockParam[] = [initialBlock];

  const logFile = `${sessionDir}/${logName}.md`;
  await fs.writeFile(
    logFile,
    `# ${path.basename(sessionDir)} — ${logName}\n\n` +
      `## System Prompt\n\n${redactSensitive(systemPrompt)}\n\n`,
  );

  for (let turn = 0; turn < maxTurns; turn++) {
    const { snap, snapFile } = await takeSnapshot();
    // API receives the full snapshot content; the log records the file path instead
    // so conversation logs stay readable without the full ARIA tree on every turn.
    const userContent = [...pendingPrefix, pageStateMessage(snap)];

    if (turn > 0) await fs.appendFile(logFile, '---\n\n');
    await fs.appendFile(logFile, `## Turn ${turn}\n\n`);
    await fs.appendFile(logFile, `### User → Agent\n\n`);
    await fs.appendFile(logFile, `\`\`\`json\n${redactSensitive(JSON.stringify([...pendingPrefix, pageStateMessage(snapFile)], null, 2))}\n\`\`\`\n\n`);

    const response = await callWithTools({
      model,
      maxTokens,
      system: systemPrompt + '\n\nBefore each tool call, start your response with one sentence ' +
        'summarizing the current page: what section is shown and what accounts or financial data ' +
        'are visible. This helps you track which pages you have already visited.',
      tools,
      messages,
      userContent,
    });

    await fs.appendFile(logFile, `### Agent → User\n\n`);
    await fs.appendFile(
      logFile,
      `\`\`\`json\n${redactSensitive(JSON.stringify(response.rawForLog, null, 2))}\n\`\`\`\n\n`,
    );

    // Archive the agent's own page summary in place of the full snapshot.
    messages.push({ role: 'user', content: [...pendingPrefix, archiveSnapshot(response.responseText, snap)] });
    messages.push({ role: 'assistant', content: response.assistantContent as MessageParam['content'] });

    const toolUses = response.toolUses;
    if (toolUses.length === 0) throw new Error('unexpected: model returned no tool calls');

    const toolResults: { type: 'tool_result'; tool_use_id: string; content: string }[] = [];
    let result: { value: T } | undefined;

    for (const toolUse of toolUses) {
      if (!result) {
        if (toolUse.name === SUCCESS_TOOL) {
          console.log(`🔄 ${turn + 1}/${maxTurns} 💬 Mission accomplished`);
        } else if (VERBOSE) {
          console.log(`🔄 ${turn + 1}/${maxTurns} 💬 ${toolUse.name}`, redactSensitive(JSON.stringify(toolUse.input)));
        } else {
          const brief = briefInput(toolUse.input as Record<string, unknown>);
          console.log(`🔄 ${turn + 1}/${maxTurns} 💬 ${toolUse.name}${brief ? ` ${brief}` : ''}`);
        }

        let output = '';
        try {
          const r = await onTool(toolUse.name, toolUse.input as Record<string, unknown>, page);
          if (isDone(r)) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: redactSensitive(r.content),
            });
            result = { value: r.value };
          } else {
            output = redactSensitive(r);
            const preview = output.length > 240 ? output.slice(0, 240) + '…' : output;
            if (toolUse.name === BROWSER_TOOL.GET_INPUTS) {
              if (VERBOSE) console.log(`🔧 Inputs retrieved:\n${preview}`);
              else console.log(`🔧 Inputs retrieved`);
            } else {
              console.log(`🔧 ${preview}`);
            }
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: output });
          }
        } catch (err) {
          // TODO: break retry loops — the model sometimes retries the same failing call
          // repeatedly even when the error is unrecoverable. Appending a "do not retry"
          // hint to the tool result was tried (tracking seen calls by toolName+input) but
          // didn't reliably stop the loop in practice because the model still found reasons
          // to retry given the full conversation history. Needs a better approach.
          output = redactSensitive(`error: ${err instanceof Error ? err.message : String(err)}`);
          if (VERBOSE) {
            const preview = output.length > 480 ? output.slice(0, 480) + '…' : output;
            // Playwright errors contain ANSI colour codes; '\x1b[0m' prevents colour bleed.
            console.log(`❌ ${preview}\x1b[0m`);
          } else {
            const errorType = err instanceof Error ? err.constructor.name : String(err);
            console.log(`❌ ${errorType}`);
          }
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: output });
        }
      } else {
        // The API requires a tool_result for every tool_use in the conversation history,
        // even for tool calls that came after the terminal tool in the same response.
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'skipped' });
      }
    }

    if (!result) {
      // Store tool results as the prefix for the next turn; the snapshot is taken
      // at the top of that turn so it captures the final post-tool page state.
      pendingPrefix = toolResults;
    } else {
      return result.value;
    }
  }

  throw new Error(`agent did not complete within ${maxTurns} turns`);
}
