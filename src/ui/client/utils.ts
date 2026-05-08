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
