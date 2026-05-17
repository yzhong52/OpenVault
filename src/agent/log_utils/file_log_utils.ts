import * as fs from 'fs/promises';
import * as path from 'path';

export async function writeLogHeader(
  logFile: string,
  sessionDir: string,
  taskName: string,
  systemPrompt: string,
  redactSensitive: (s: string) => string,
): Promise<void> {
  await fs.writeFile(
    logFile,
    `# ${path.basename(sessionDir)} — ${taskName}\n\n` +
      `## System Prompt\n\n${redactSensitive(systemPrompt)}\n\n`,
  );
}

export async function appendTurnHeader(logFile: string, turn: number): Promise<void> {
  if (turn > 0) await fs.appendFile(logFile, '---\n\n');
  await fs.appendFile(logFile, `## Turn ${turn}\n\n`);
}

export async function appendSummarizeInput(
  logFile: string,
  turn: number,
  userMsg: string,
  redactSensitive: (s: string) => string,
): Promise<void> {
  await fs.appendFile(logFile, `### Turn ${turn} — Summarize\n\n`);
  await fs.appendFile(logFile, `#### Input\n\n\`\`\`\n${redactSensitive(userMsg)}\n\`\`\`\n\n`);
}

export async function appendSummarizeOutput(logFile: string, summary: string): Promise<void> {
  await fs.appendFile(logFile, `#### Output\n\n\`\`\`json\n${summary}\n\`\`\`\n\n`);
}

export async function appendActInput(
  logFile: string,
  turn: number,
  summary: string,
): Promise<void> {
  await fs.appendFile(logFile, `### Turn ${turn} — Act\n\n`);
  await fs.appendFile(logFile, `#### Input\n\n\`\`\`json\n${summary}\n\`\`\`\n\n`);
}

export async function appendActResponse(
  logFile: string,
  rawResponse: unknown,
  redactSensitive: (s: string) => string,
): Promise<void> {
  await fs.appendFile(
    logFile,
    `#### Response\n\n\`\`\`json\n` +
      `${redactSensitive(JSON.stringify(rawResponse, null, 2))}\n\`\`\`\n\n`,
  );
}
