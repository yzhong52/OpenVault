// Strip dynamic values that change between runs but don't affect page structure.
// Order matters: more specific patterns first.
const NORMALIZE_RULES: Array<[RegExp, string]> = [
  // Dollar amounts  e.g. "$1,234.56"
  [/\$[\d,]+(?:\.\d+)?/g, '$_'],
  // Masked account numbers  e.g. "****1234", "XXXX-1234"
  [/[Xx*]{2,}[\s-]?\d+/g, 'ACCT'],
  // Large comma-separated numbers  e.g. "1,234,567.89"
  [/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, '_NUM_'],
  // Decimal numbers with exactly 2 places (financial amounts)
  [/\b\d+\.\d{2}\b/g, '_NUM_'],
  // Percentages  e.g. "3.5%"
  [/\b\d+(?:\.\d+)?%/g, '_%'],
  // ISO dates  e.g. "2024-01-15"
  [/\d{4}-\d{2}-\d{2}/g, '_DATE_'],
  // Month Day, Year  e.g. "January 15, 2024" or "Jan 15 2024"
  // (regex is intentionally long — month abbreviation alternation can't be split)
  [/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\b\.?\s+\d{1,2},?\s+\d{4}/gi, '_DATE_'],
  // Numeric dates  e.g. "01/15/2024"
  [/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '_DATE_'],
  // Times  e.g. "3:45 PM", "15:30:00"
  [/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?\b/gi, '_TIME_'],
];

export function normalizeSnapshot(snapshot: string): string {
  let s = snapshot;
  for (const [re, sub] of NORMALIZE_RULES) s = s.replace(re, sub);
  return s.replace(/\s+/g, ' ').trim();
}
