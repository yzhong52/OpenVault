import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { Page } from 'playwright';
import * as fs from 'fs/promises';
import { redact } from './redact';
import { callWithTools, callForText } from './model_providers';
import {
  logSnapshot,
  logToolError,
  logToolResult,
  logToolUse,
  writeLogHeader,
  appendTurnHeader,
  appendSummarizeInput,
  appendSummarizeOutput,
  appendActInput,
  appendActResponse,
} from './log_utils';
export { SUCCESS_TOOL } from './tools';
export { createSession, SEPARATOR } from './log_utils';

export const MAX_TURNS = 20;

export interface ToolContinue {
  done: false;
  content: string;
}

export interface ToolDone<T> {
  done: true;
  value: T;
  content: string;
}

export function toolResult(content: string): ToolContinue {
  return { done: false, content };
}

export function toolDone<T>(value: T, content: string): ToolDone<T> {
  return { done: true, value, content };
}

function isDone<T>(r: ToolContinue | ToolDone<T>): r is ToolDone<T> {
  return r.done;
}

// Prompt for Call 1 each turn: synthesize previous state + tool results + current snapshot
// into a structured JSON summary. The act model (Call 2) receives only this summary.
const SUMMARIZE_SYSTEM =
  'You are tracking the state of a browser automation session. ' +
  'Given what was known before, the results of recent actions, and the current page snapshot, ' +
  'produce a concise JSON summary of: pages visited, data collected so far (with specific names ' +
  'and values), and what still needs to be found. ' +
  'Output only the JSON object — no explanation, no markdown code fences.';

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escaped) {
      escaped = false;
    } else if (ch === '\\' && inString) {
      escaped = true;
    } else if (ch === '"') {
      inString = !inString;
    } else if (!inString) {
      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start >= 0) return candidate.slice(start, i + 1);
      }
    }
  }
  return null;
}

function normalizeSummaryJson(raw: string): string {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) throw new Error('summary response did not contain a JSON object');
  const parsed = JSON.parse(jsonText) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('summary response must be a JSON object');
  }
  return JSON.stringify(parsed, null, 2);
}

// Wait for the page to settle, then take an ARIA snapshot. Returns the redacted snapshot text.
// 8s networkidle covers slow SPA login API calls; we snapshot anyway if the page stays busy.
async function takeSnapshot(
  page: Page,
  snapFile: string,
  redactSensitive: (s: string) => string,
): Promise<string> {
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
  await fs.writeFile(snapFile, snap);
  logSnapshot(snap, snapFile);
  return snap;
}

// Call the summarizer model with the given user message, parse and validate the JSON response,
// and retry once with an error hint if the initial response is not valid JSON.
async function summarizeState(
  userMessage: string,
  model: string,
  redactSensitive: (s: string) => string,
): Promise<string> {
  const raw = await callForText({ model, system: SUMMARIZE_SYSTEM, userMessage, maxTokens: 1024 });
  try {
    return redactSensitive(normalizeSummaryJson(raw));
  } catch (err) {
    const retryRaw = await callForText({
      model,
      system: SUMMARIZE_SYSTEM,
      userMessage:
        `${userMessage}\n\nYour previous response was invalid JSON: ` +
        `${err instanceof Error ? err.message : String(err)}. ` +
        'Return only one valid JSON object.',
      maxTokens: 1024,
    });
    return redactSensitive(normalizeSummaryJson(retryRaw));
  }
}

// T is the task's return type — e.g. Account[] for exploreAccounts, void for login.
//
// systemPrompt: task instructions for the act model — what to find and which tools to use.
//
// initialMessage: context for the first turn's summarizer (e.g. "User is now logged in.").
//
// onTool: called for each tool use. Return toolResult(str) to continue or toolDone(value) to end.
export async function runAgent<T>(
  page: Page,
  tools: Tool[],
  systemPrompt: string,
  initialMessage: string,
  onTool: (
    name: string,
    input: Record<string, unknown>,
    page: Page,
  ) => Promise<ToolContinue | ToolDone<T>>,
  sessionDir: string,
  taskName: string,
  sensitiveValues: string[] = [],
  maxTurns: number,
  maxTokens: number,
  model: string,
): Promise<T> {
  const redactSensitive = (text: string) => redact(text, sensitiveValues);
  const snapshotsDir = `${sessionDir}/snapshots`;
  const snapPrefix = `snapshot_${taskName}`;
  await fs.mkdir(snapshotsDir, { recursive: true });

  const logFile = `${sessionDir}/conversation_${taskName}.md`;
  await writeLogHeader(logFile, sessionDir, taskName, systemPrompt, redactSensitive);

  // currentSummary carries the JSON state produced by Call 1 into Call 2 and the next turn.
  // lastToolResults carries the outcomes of Call 2's tool executions into the next turn's Call 1.
  let currentSummary = '';
  let lastToolResults: string[] = [];
  let snapCount = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const snapFile = `${snapshotsDir}/${snapPrefix}_${String(++snapCount).padStart(3, '0')}.txt`;
    const snap = await takeSnapshot(page, snapFile, redactSensitive);

    await appendTurnHeader(logFile, turn);

    // ── Call 1: Summarize ──────────────────────────────────────────────────────
    const summarizeParts: string[] = [];
    if (currentSummary) {
      summarizeParts.push(`Previous state:\n${currentSummary}`);
    } else {
      summarizeParts.push(`Session context: ${initialMessage}`);
    }
    if (lastToolResults.length > 0) {
      summarizeParts.push(`Last actions and results:\n${lastToolResults.join('\n')}`);
    }
    summarizeParts.push(`Current page (${snapFile}):\n${snap}`);
    const summarizeUserMsg = summarizeParts.join('\n\n');

    await appendSummarizeInput(logFile, turn, summarizeUserMsg, redactSensitive);
    currentSummary = await summarizeState(summarizeUserMsg, model, redactSensitive);
    await appendSummarizeOutput(logFile, currentSummary);

    // ── Call 2: Act ────────────────────────────────────────────────────────────
    await appendActInput(logFile, turn, currentSummary);

    const response = await callWithTools({
      model,
      maxTokens,
      system: systemPrompt,
      tools,
      messages: [],
      userContent: [
        { type: 'text', text: `Current state:\n${currentSummary}` },
        { type: 'text', text: `Current page:\n${snap}` },
      ],
    });

    await appendActResponse(logFile, response.rawForLog, redactSensitive);

    const toolUses = response.toolUses;
    if (toolUses.length === 0) throw new Error('unexpected: model returned no tool calls');

    lastToolResults = [];
    let completion: { value: T } | undefined;

    for (const toolUse of toolUses) {
      if (!completion) {
        logToolUse(turn, maxTurns, toolUse.name, toolUse.input as Record<string, unknown>, redactSensitive);

        let output = '';
        try {
          const r = await onTool(toolUse.name, toolUse.input as Record<string, unknown>, page);
          if (isDone(r)) {
            output = redactSensitive(r.content);
            completion = { value: r.value };
          } else {
            output = redactSensitive(r.content);
            logToolResult(toolUse.name, output);
          }
          lastToolResults.push(`${toolUse.name}: ${output}`);
        } catch (err) {
          output = redactSensitive(`error: ${err instanceof Error ? err.message : String(err)}`);
          logToolError(err, output);
          lastToolResults.push(`${toolUse.name}: ${output}`);
        }
      }
    }

    if (completion) return completion.value;
  }

  throw new Error(`agent did not complete within ${maxTurns} turns`);
}
