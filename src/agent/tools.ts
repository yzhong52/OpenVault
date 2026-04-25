import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { Session } from '../browser/session';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export const TOOLS: Tool[] = [
  {
    name: 'navigate',
    description: 'Navigate the browser to a URL',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'click',
    description: 'Click an element by its ARIA role and accessible name',
    input_schema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'ARIA role, e.g. button, link, tab' },
        name: { type: 'string', description: 'Accessible name of the element' },
      },
      required: ['role', 'name'],
    },
  },
  {
    name: 'type_text',
    description: 'Fill text into an input element by its ARIA role and accessible name',
    input_schema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'ARIA role, typically textbox or combobox' },
        name: { type: 'string', description: 'Accessible name (label) of the input' },
        text: { type: 'string' },
      },
      required: ['role', 'name', 'text'],
    },
  },
  {
    name: 'snapshot',
    description: 'Refresh the accessibility snapshot of the current page and return it',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'wait_for_navigation',
    description: 'Wait for the page to finish loading after a navigation or form submit',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'wait_for_mfa',
    description: 'Pause and prompt the user to complete MFA in the browser window',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'done',
    description: 'Signal that the task is complete and return the result',
    input_schema: {
      type: 'object',
      properties: { result: { type: 'string' } },
      required: ['result'],
    },
  },
];

export async function executeTool(call: ToolCall, session: Session): Promise<string> {
  const { name, input } = call;

  switch (name) {
    case 'navigate': {
      const url = input.url as string;
      await session.page.goto(url, { waitUntil: 'domcontentloaded' });
      return `navigated to ${url}`;
    }

    case 'click': {
      const role = input.role as Parameters<typeof session.page.getByRole>[0];
      const elName = input.name as string;
      await session.page.getByRole(role, { name: elName }).click();
      return `clicked ${role} "${elName}"`;
    }

    case 'type_text': {
      const role = input.role as Parameters<typeof session.page.getByRole>[0];
      const elName = input.name as string;
      const text = input.text as string;
      await session.page.getByRole(role, { name: elName }).fill(text);
      return `typed into ${role} "${elName}"`;
    }

    case 'snapshot':
      return session.snapshot();

    case 'wait_for_navigation':
      await session.page.waitForLoadState('networkidle');
      return 'page settled';

    case 'wait_for_mfa':
      await session.waitForUser('MFA required. Complete verification in the browser window.');
      return 'MFA complete — resuming';

    case 'done':
      return (input.result as string) ?? 'done';

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
