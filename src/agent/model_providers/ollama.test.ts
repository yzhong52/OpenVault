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
});
