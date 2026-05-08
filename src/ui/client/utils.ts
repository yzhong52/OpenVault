const INST_ICONS: Record<string, string> = {
  'questrade': 'questrade.png',
  'schwab': 'schwab.png',
  'charles schwab': 'schwab.png',
  'td': 'td.png',
  'td bank': 'td.png',
  'tangerine': 'tangerine.png',
  'wealthsimple': 'wealthsimple.png',
  'rbc': 'rbc.png',
  'royal bank': 'rbc.png',
  'bmo': 'bmo.png',
  'bank of montreal': 'bmo.png',
  'cibc': 'cibc.png',
  'scotiabank': 'scotiabank.png',
  'national bank': 'national-bank.png',
  'simplii': 'simplii.png',
  'desjardins': 'desjardins.png',
  'eq bank': 'eq-bank.png',
  'fidelity': 'fidelity.png',
  'vanguard': 'vanguard.png',
  'interactive brokers': 'interactive-brokers.png',
  'bank of america': 'bank-of-america.png',
  'wells fargo': 'wells-fargo.png',
  'chase': 'chase.png',
  'ally': 'ally.png',
};

export function getInstLogoUrl(name: string): string | null {
  const lower = name.toLowerCase().trim();
  const file = INST_ICONS[lower]
    ?? Object.entries(INST_ICONS).find(([k]) => lower.includes(k))?.[1]
    ?? null;
  return file ? `/icons/${file}` : null;
}

const PALETTE = [
  '#1a5276', '#00b4a0', '#e84b4b', '#f47c30', '#7c5cbf',
  '#2ecc71', '#2980b9', '#c0392b', '#d35400', '#8e44ad',
];

export function getInstColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0x7fffffff;
  }
  return PALETTE[hash % PALETTE.length];
}

export function getInstAbbr(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function fmtCents(cents: number | null): string {
  if (cents === null) return '—';
  const val = Math.abs(cents) / 100;
  const str = val.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (cents < 0 ? '-$' : '$') + str;
}

export function fmtCentsK(cents: number): string {
  const val = Math.abs(cents) / 100;
  const str = val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toLocaleString('en-CA', { maximumFractionDigits: 0 });
  return (cents < 0 ? '-$' : '$') + str;
}
