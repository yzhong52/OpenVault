import { describe, it, expect } from 'vitest';
import { parseToolCallsFromText } from './ollama';

describe('parseToolCallsFromText', () => {
  it('parses multiple bare JSON objects with nested arguments', () => {
    const text = `{
  "name": "fill_username",
  "arguments": {
    "selector": "#userId"
  }
}

{
  "name": "fill_password",
  "arguments": {
    "selector": "#password"
  }
}

{
  "name": "click_js",
  "arguments": {
    "selector": "button:has-text('Log in')"
  }
}`;

    const result = parseToolCallsFromText(text);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ name: 'fill_username', input: { selector: '#userId' } });
    expect(result[1]).toMatchObject({ name: 'fill_password', input: { selector: '#password' } });
    expect(result[2]).toMatchObject({ name: 'click_js', input: { selector: "button:has-text('Log in')" } });
  });

  it('parses a single markdown ```json code block', () => {
    const text = '```json\n{"name":"snapshot","arguments":{}}\n```';
    const result = parseToolCallsFromText(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'snapshot', input: {} });
  });

  it('parses multiple markdown code blocks', () => {
    const text = [
      '```json\n{"name":"fill","arguments":{"role":"textbox","name":"Username","value":"alice"}}\n```',
      '```\n{"name":"click","arguments":{"role":"button","name":"Log in"}}\n```',
    ].join('\n');
    const result = parseToolCallsFromText(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: 'fill' });
    expect(result[1]).toMatchObject({ name: 'click' });
  });

  it('parses <tool_call> XML blocks', () => {
    const text = '<tool_call>{"name":"snapshot","arguments":{}}</tool_call>';
    const result = parseToolCallsFromText(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'snapshot', input: {} });
  });

  it('accepts "parameters" as an alias for "arguments"', () => {
    const text = '{"name":"fill","parameters":{"role":"textbox","name":"Email"}}';
    const result = parseToolCallsFromText(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'fill', input: { role: 'textbox', name: 'Email' } });
  });

  it('returns empty array for plain text with no tool calls', () => {
    const text = 'Please provide the updated page state so I can determine next steps.';
    expect(parseToolCallsFromText(text)).toHaveLength(0);
  });

  it('returns empty array for an empty string', () => {
    expect(parseToolCallsFromText('')).toHaveLength(0);
  });

  it('assigns unique ids to each parsed call', () => {
    const text = '{"name":"snapshot","arguments":{}}\n{"name":"click","arguments":{"role":"button","name":"Submit"}}';
    const result = parseToolCallsFromText(text);
    expect(result).toHaveLength(2);
    expect(result[0].id).not.toBe(result[1].id);
  });
});
