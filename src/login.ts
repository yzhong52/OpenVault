import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import type { Page } from 'playwright';
import * as readline from 'readline';
import * as fs from 'fs/promises';

// Set DEBUG=1 to log each message sent to Claude and pause 1s between tool calls.
const DEBUG = process.env.DEBUG === '1';

function debug(...args: unknown[]): void {
  if (DEBUG) console.log(...args);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface Credentials {
  email: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function buildSystemPrompt(creds: Credentials): string {
  return `\
You are a browser automation agent. Your job is to log into a financial institution website.

Credentials to use:
  Email / username: ${creds.email}
  Password:         ${creds.password}

Login flow:
  1. Identify the login form fields and fill in the credentials above.
  2. Submit the form.
  3. If a multi-factor authentication (MFA) or verification code screen appears,
     call request_mfa_code with a short description of what the user should do.
     The tool returns the code the user typed — use the type tool (not fill)
     to enter it, then submit.
  4. Once you can see the account dashboard or portfolio summary, call success.

Always call snapshot after submitting a form or clicking a button so you can
see the updated page state before deciding what to do next.`;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const TOOL = {
  SNAPSHOT:         'snapshot',
  FILL:             'fill',
  TYPE:             'type',
  CLICK:            'click',
  CLICK_TESTID:     'click_testid',
  CLICK_TEXT:       'click_text',
  CLICK_JS:         'click_js',
  PRESS_ENTER:      'press_enter',
  REQUEST_MFA_CODE: 'request_mfa_code',
  SUCCESS:          'success',
} as const;

const TOOLS: Tool[] = [
  {
    name: TOOL.SNAPSHOT,
    description: 'Return the current page accessibility tree. Call this after any navigation or click to see updated state.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: TOOL.FILL,
    description: 'Fill a form field identified by its ARIA role and accessible name.',
    input_schema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'ARIA role, e.g. textbox, combobox' },
        name: { type: 'string', description: 'Accessible name of the field (label text)' },
        value: { type: 'string' },
      },
      required: ['role', 'name', 'value'],
    },
  },
  {
    name: TOOL.TYPE,
    description: 'Type text into a field character-by-character, firing real key events. Use this instead of fill for OTP / verification code fields where key events are required to enable the submit button.',
    input_schema: {
      type: 'object',
      properties: {
        role: { type: 'string' },
        name: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['role', 'name', 'value'],
    },
  },
  {
    name: TOOL.CLICK,
    description: 'Click an element identified by its ARIA role and accessible name.',
    input_schema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'ARIA role, e.g. button, link' },
        name: { type: 'string', description: 'Accessible name of the element' },
      },
      required: ['role', 'name'],
    },
  },
  {
    name: TOOL.CLICK_TESTID,
    description: 'Click an element by its data-testid attribute. Use this when click fails with a strict mode violation (multiple elements matched).',
    input_schema: {
      type: 'object',
      properties: {
        testId: { type: 'string' },
      },
      required: ['testId'],
    },
  },
  {
    name: TOOL.CLICK_TEXT,
    description: 'Click an element by its visible text content. Use when the button ARIA name is unclear or does not match visible text.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Visible text of the element to click' },
        exact: { type: 'boolean', description: 'Match text exactly (default true)' },
      },
      required: ['text'],
    },
  },
  {
    name: TOOL.CLICK_JS,
    description: 'Click an element using a JavaScript querySelector. Use as a last resort when Playwright click fails due to visibility or overlap checks.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the element' },
      },
      required: ['selector'],
    },
  },
  {
    name: TOOL.PRESS_ENTER,
    description: 'Press the Enter key on an element identified by ARIA role and name. Use to submit forms when clicking the submit button fails.',
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
    name: TOOL.REQUEST_MFA_CODE,
    description: 'Pause and ask the user to provide an MFA / verification code. Returns the code the user entered.',
    input_schema: {
      type: 'object',
      properties: {
        instructions: { type: 'string', description: 'Short message shown to the user, e.g. "Enter the 6-digit code sent to your phone"' },
      },
      required: ['instructions'],
    },
  },
  {
    name: TOOL.SUCCESS,
    description: 'Signal that login is complete and the dashboard is visible. Call this as soon as you can see the account overview.',
    input_schema: { type: 'object', properties: {} },
  },
];

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

async function executeTool(
  name: string,
  input: Record<string, string>,
  page: Page,
): Promise<string> {
  switch (name) {
    case TOOL.SNAPSHOT:
      return page.locator('body').ariaSnapshot();

    case TOOL.FILL: {
      const role = input.role as Parameters<typeof page.getByRole>[0];
      await page.getByRole(role, { name: input.name }).fill(input.value);
      return `filled ${input.role} "${input.name}"`;
    }

    case TOOL.TYPE: {
      const role = input.role as Parameters<typeof page.getByRole>[0];
      await page.getByRole(role, { name: input.name }).pressSequentially(input.value);
      return `typed into ${input.role} "${input.name}"`;
    }

    case TOOL.CLICK: {
      const role = input.role as Parameters<typeof page.getByRole>[0];
      await page.getByRole(role, { name: input.name }).click();
      // Use a short timeout — SPA navigation won't fire a full 'load' event.
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      return `clicked ${input.role} "${input.name}"`;
    }

    case TOOL.CLICK_TESTID: {
      await page.getByTestId(input.testId).click();
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      return `clicked [data-testid="${input.testId}"]`;
    }

    case TOOL.CLICK_TEXT: {
      const exact = input.exact !== 'false';
      await page.getByText(input.text, { exact }).click();
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      return `clicked text "${input.text}"`;
    }

    case TOOL.CLICK_JS: {
      await page.$eval(input.selector, (el: HTMLElement) => el.click());
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      return `js-clicked "${input.selector}"`;
    }

    case TOOL.PRESS_ENTER: {
      const role = input.role as Parameters<typeof page.getByRole>[0];
      await page.getByRole(role, { name: input.name }).press('Enter');
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      return `pressed Enter on ${input.role} "${input.name}"`;
    }

    case TOOL.REQUEST_MFA_CODE: {
      const code = await promptUser(`\n${input.instructions}\nCode: `);
      return code.trim();
    }

    default:
      return `unknown tool: ${name}`;
  }
}

// ---------------------------------------------------------------------------
// Login agent
// ---------------------------------------------------------------------------

const MODEL = 'claude-sonnet-4-6';
const MAX_TURNS = 20;

export async function login(page: Page, url: string, creds: Credentials): Promise<void> {
  const client = new Anthropic();  // reads ANTHROPIC_API_KEY from env

  await page.goto(url, { waitUntil: 'load' });
  const initialSnapshot = await page.locator('body').ariaSnapshot();

  const messages: MessageParam[] = [
    {
      role: 'user',
      content: `The browser has navigated to the login page. Here is the current accessibility snapshot:\n\n${initialSnapshot}`,
    },
  ];

  const systemPrompt = buildSystemPrompt(creds);
  console.log('agent: starting login...');

  const sessionTag = new URL(url).hostname.replace(/\./g, '_') + '_' + Date.now();
  await fs.mkdir('logs', { recursive: true });
  let snapCount = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const lastMessage = messages[messages.length - 1];
    debug('\n── prompt to claude ──────────────────────────────');
    debug(JSON.stringify(lastMessage, null, 2));
    debug('──────────────────────────────────────────────────\n');

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      tool_choice: { type: 'any' },
      messages,
    });

    messages.push({
      role: 'assistant', // record what Claude said
      content: response.content,
    });

    const toolUses = response.content.filter(b => b.type === 'tool_use');
    if (toolUses.length === 0) break;

    // Execute every tool_use and collect results — the API requires one
    // tool_result per tool_use in the next message, no exceptions.
    const toolResults: { type: 'tool_result'; tool_use_id: string; content: string }[] = [];
    let done = false;

    for (const toolUse of toolUses) {
      console.log(`[turn ${turn + 1}/${MAX_TURNS}] [tool] ${toolUse.name}`, toolUse.input);

      // tool_choice 'any' forces Claude to always call a tool, so success is the
      // only way Claude can explicitly signal it's done rather than just stopping.
      if (toolUse.name === TOOL.SUCCESS) {
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'login complete' });
        done = true;
        break;
      }

      let output: string;
      try {
        output = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, string>,
          page,
        );
      } catch (err) {
        output = `error: ${err instanceof Error ? err.message : String(err)}`;
      }

      console.log(`[turn ${turn + 1}/${MAX_TURNS}] [tool] → ${output.length > 120 ? output.slice(0, 120) + '…' : output}`);
      if (DEBUG) await sleep(1000);

      if (toolUse.name === TOOL.SNAPSHOT) {
        const file = `logs/${sessionTag}_${String(++snapCount).padStart(3, '0')}.txt`;
        await fs.writeFile(file, output);
      }

      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: output });
    }

    messages.push({
      role: 'user', // tool results come from us (the environment), not Claude
      content: toolResults,
    });

    if (done) {
      console.log('agent: login complete');
      return;
    }
  }

  throw new Error(`agent did not complete login within ${MAX_TURNS} turns`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

