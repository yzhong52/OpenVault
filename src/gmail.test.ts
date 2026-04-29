import { describe, it, expect } from 'vitest';
import { extractMfaCode } from './gmail';

describe('extractMfaCode', () => {
  it('extracts code from real Tangerine MFA email', () => {
    const text = `
From: 864674

Tangerine: Login attempted. If it's not you, call 1-888-826-4374 now. Your Security Code is 962773. Don't share it with anyone. We'll never call to ask for it.
`.trim();
    expect(extractMfaCode(text)).toBe('962773');
  });

  it('extracts code after "verification code"', () => {
    const text = 'Your verification code is 123456. It expires in 10 minutes.';
    expect(extractMfaCode(text)).toBe('123456');
  });

  it('extracts code after "OTP"', () => {
    const text = 'Your OTP: 748291. Valid for 5 minutes.';
    expect(extractMfaCode(text)).toBe('748291');
  });

  it('extracts code after "one-time code"', () => {
    const text = 'Use this one-time code: 391820 to complete sign-in.';
    expect(extractMfaCode(text)).toBe('391820');
  });

  it('extracts code after "passcode"', () => {
    const text = 'Your passcode is 556677. Do not share.';
    expect(extractMfaCode(text)).toBe('556677');
  });

  it('falls back to first 6-digit number when no keyword matches', () => {
    const text = 'Use 445566 to log in.';
    expect(extractMfaCode(text)).toBe('445566');
  });

  it('ignores phone numbers in favour of keyword-matched code', () => {
    const text = 'Call 1-888-826-4374 if not you. Your Security Code is 962773.';
    expect(extractMfaCode(text)).toBe('962773');
  });

  it('returns null when no code is found', () => {
    expect(extractMfaCode('No codes here, just text.')).toBeNull();
  });
});
