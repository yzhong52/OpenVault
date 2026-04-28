import * as fs from 'fs/promises';
import * as path from 'path';
import { DATA_DIR } from './db';

interface Config {
  gmailAddress?: string;
}

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export async function loadConfig(): Promise<Config> {
  try {
    return JSON.parse(await fs.readFile(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export async function saveConfig(patch: Partial<Config>): Promise<void> {
  const config = await loadConfig();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify({ ...config, ...patch }, null, 2) + '\n');
}
