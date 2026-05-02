import { describe, it, expect } from 'vitest';
import { normalizeSnapshot } from './normalizeSnapshot';

describe('normalizeSnapshot', () => {
  it('strips dollar amounts', () => {
    const snap = '- text "$1,234.56"';
    expect(normalizeSnapshot(snap)).toBe('- text "$_"');
  });

  it('strips large comma-separated numbers', () => {
    const snap = '- text "258,486.25"';
    expect(normalizeSnapshot(snap)).toBe('- text "_NUM_"');
  });

  it('strips ISO dates', () => {
    const snap = '- text "2024-01-15"';
    expect(normalizeSnapshot(snap)).toBe('- text "_DATE_"');
  });

  it('strips month-day-year dates', () => {
    const snap = '- text "January 15, 2024"';
    expect(normalizeSnapshot(snap)).toBe('- text "_DATE_"');
  });

  it('strips abbreviated month dates', () => {
    const snap = '- text "Jan 15, 2024"';
    expect(normalizeSnapshot(snap)).toBe('- text "_DATE_"');
  });

  it('strips times', () => {
    const snap = '- text "3:45 PM"';
    expect(normalizeSnapshot(snap)).toBe('- text "_TIME_"');
  });

  it('strips masked account numbers', () => {
    const snap = '- text "****1234"';
    expect(normalizeSnapshot(snap)).toBe('- text "ACCT"');
  });

  it('strips percentages', () => {
    const snap = '- text "3.5%"';
    expect(normalizeSnapshot(snap)).toBe('- text "_%"');
  });

  it('preserves structural elements', () => {
    const snap = '- button "Log in"\n- link "Forgot password?"\n- heading "Sign in" [level=1]';
    expect(normalizeSnapshot(snap)).toBe(
      '- button "Log in" - link "Forgot password?" - heading "Sign in" [level=1]',
    );
  });

  it('produces identical fingerprints for structurally equivalent snapshots', () => {
    const snap1 = '- text "Total equity"\n- text "$258,486.25"\n- text "Updated Jan 15, 2024 at 3:45 PM"';
    const snap2 = '- text "Total equity"\n- text "$301,200.00"\n- text "Updated Feb 28, 2024 at 9:12 AM"';
    expect(normalizeSnapshot(snap1)).toBe(normalizeSnapshot(snap2));
  });

  it('does not collapse structurally different pages', () => {
    const loginPage = '- textbox "Email"\n- textbox "Password"\n- button "Log in"';
    const dashPage  = '- heading "Portfolio"\n- text "$50,000.00"\n- link "View accounts"';
    expect(normalizeSnapshot(loginPage)).not.toBe(normalizeSnapshot(dashPage));
  });
});
