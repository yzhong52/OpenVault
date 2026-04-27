import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import type { Page } from 'playwright';

const DEBUG = process.env.DEBUG === '1';

function debug(...args: unknown[]): void {
  if (DEBUG) console.log(...args);
}

export interface Account {
  name: string;
  type?: string;
  balance?: string;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const TOOL = {
  SNAPSHOT:        'snapshot',
  CLICK:           'click',
  CLICK_TESTID:    'click_testid',
  REPORT_ACCOUNTS: 'report_accounts',
} as const;

const TOOLS: Tool[] = [
  {
    name: TOOL.SNAPSHOT,
    description: 'Return the current page accessibility tree. Call this after any navigation or click.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: TOOL.CLICK,
    description: 'Click an element by its ARIA role and accessible name.',
    input_schema: {
      type: 'object',
      properties: {
        role: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['role', 'name'],
    },
  },
  {
    name: TOOL.CLICK_TESTID,
    description: 'Click an element by its data-testid attribute. Use when click fails with a strict mode violation.',
    input_schema: {
      type: 'object',
      properties: {
        testId: { type: 'string' },
      },
      required: ['testId'],
    },
  },
  {
    name: TOOL.REPORT_ACCOUNTS,
    description: 'Report all accounts you found. Call this once you have collected all account names, types, and balances visible on the page.',
    input_schema: {
      type: 'object',
      properties: {
        accounts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name:    { type: 'string', description: 'Account name or label' },
              type:    { type: 'string', description: 'Account type, e.g. TFSA, RRSP, chequing' },
              balance: { type: 'string', description: 'Current balance as displayed, e.g. "$12,345.67"' },
            },
            required: ['name'],
          },
        },
      },
      required: ['accounts'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  page: Page,
): Promise<string> {
  switch (name) {
    case TOOL.SNAPSHOT:
      return page.locator('body').ariaSnapshot();

    case TOOL.CLICK: {
      const role = input.role as Parameters<typeof page.getByRole>[0];
      await page.getByRole(role, { name: input.name as string }).click();
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      return `clicked ${input.role} "${input.name}"`;
    }

    case TOOL.CLICK_TESTID: {
      await page.getByTestId(input.testId as string).click();
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      return `clicked [data-testid="${input.testId}"]`;
    }

    default:
      return `unknown tool: ${name}`;
  }
}

// ---------------------------------------------------------------------------
// Accounts agent
// ---------------------------------------------------------------------------

const MODEL = 'claude-sonnet-4-6';
const MAX_TURNS = 20;

const SYSTEM_PROMPT = `\
You are a browser automation agent. The user has just logged into their financial institution and the dashboard is visible.

Your job is to find all accounts on the page — including their names, types (e.g. TFSA, RRSP, chequing, savings), and balances.

Steps:
1. Call snapshot to see the current page state.
2. Identify all account entries. They typically appear as a list with a label and a dollar amount.
3. If the accounts are behind a tab or link (e.g. "All accounts", "Holdings"), click it and snapshot again.
4. Once you have a complete list, call report_accounts with all the accounts you found.

Do not navigate away from the dashboard. Do not click login/logout links.`;

export async function findAccounts(page: Page): Promise<Account[]> {
  const client = new Anthropic();

  const messages: MessageParam[] = [
    {
      role: 'user',
      content: 'The user is now logged in. Please find all accounts on the dashboard.',
    },
  ];

  console.log('agent: finding accounts...');

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const lastMessage = messages[messages.length - 1];
    debug('\n── prompt to claude ──────────────────────────────');
    debug(JSON.stringify(lastMessage, null, 2));
    debug('──────────────────────────────────────────────────\n');

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      tool_choice: { type: 'any' },
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter(b => b.type === 'tool_use');
    if (toolUses.length === 0) break;

    const toolResults: { type: 'tool_result'; tool_use_id: string; content: string }[] = [];
    let accounts: Account[] | null = null;

    for (const toolUse of toolUses) {
      console.log(`[turn ${turn + 1}/${MAX_TURNS}] [tool] ${toolUse.name}`, toolUse.input);

      if (toolUse.name === TOOL.REPORT_ACCOUNTS) {
        const input = toolUse.input as { accounts: Account[] };
        accounts = input.accounts;
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'accounts recorded' });
        break;
      }

      let output: string;
      try {
        output = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          page,
        );
      } catch (err) {
        output = `error: ${err instanceof Error ? err.message : String(err)}`;
      }

      console.log(`[turn ${turn + 1}/${MAX_TURNS}] [tool] → ${output.length > 120 ? output.slice(0, 120) + '…' : output}`);
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: output });
    }

    messages.push({ role: 'user', content: toolResults });

    if (accounts !== null) {
      return accounts;
    }
  }

  throw new Error(`agent did not find accounts within ${MAX_TURNS} turns`);
}
