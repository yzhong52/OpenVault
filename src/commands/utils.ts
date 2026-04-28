import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { DATA_DIR } from '../db';

export interface Institution {
  name: string;
  url: string;
  username: string;
}

export const INSTITUTIONS_FILE = path.join(DATA_DIR, 'accounts.json');
export const PROFILE_DIR = process.env.OPENVAULT_PROFILE_DIR ?? path.join(DATA_DIR, 'browser-profile');

export async function readInstitutions(): Promise<Institution[]> {
  try {
    return JSON.parse(await fs.readFile(INSTITUTIONS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export async function writeInstitutions(institutions: Institution[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(INSTITUTIONS_FILE, JSON.stringify(institutions, null, 2) + '\n');
}

export function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

export function promptPassword(question: string): Promise<string> {
  process.stdout.write(question);
  process.stdin.setRawMode?.(true);
  return new Promise(resolve => {
    let value = '';
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', function handler(ch) {
      const char = ch.toString();
      if (char === '\r' || char === '\n') {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.stdin.removeListener('data', handler);
        process.stdout.write('\n');
        resolve(value);
      } else if (char === '') {
        process.exit();
      } else if (char === '') {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    });
  });
}
