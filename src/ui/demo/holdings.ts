const DEMO_HOLDINGS = [
  { symbol: 'SPY',   name: 'SPDR S&P 500 ETF' },
  { symbol: 'QQQ',   name: 'Invesco Nasdaq 100 ETF' },
  { symbol: 'VTI',   name: 'Vanguard Total Market ETF' },
  { symbol: 'VFV',   name: 'Vanguard S&P 500 Index ETF' },
  { symbol: 'AAPL',  name: 'Apple Inc.' },
  { symbol: 'MSFT',  name: 'Microsoft Corp.' },
  { symbol: 'NVDA',  name: 'NVIDIA Corp.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN',  name: 'Amazon.com Inc.' },
  { symbol: 'META',  name: 'Meta Platforms Inc.' },
  { symbol: 'TSLA',  name: 'Tesla Inc.' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway' },
  { symbol: 'JPM',   name: 'JPMorgan Chase & Co.' },
  { symbol: 'JNJ',   name: 'Johnson & Johnson' },
  { symbol: 'XEI',   name: 'iShares S&P/TSX Comp High Div ETF' },
  { symbol: 'GLD',   name: 'SPDR Gold Shares' },
  { symbol: 'VYM',   name: 'Vanguard High Dividend Yield ETF' },
  { symbol: 'AGG',   name: 'iShares Core US Aggregate Bond ETF' },
  { symbol: 'VGT',   name: 'Vanguard Information Technology ETF' },
  { symbol: 'SHOP',  name: 'Shopify Inc.' },
];

// One stable price per symbol (in cents). Market value is derived as price × quantity,
// so the same symbol always shows a consistent price across accounts.
const demoSymbolPrices = new Map<string, number>();
export function getDemoSymbolPrice(symbol: string): number {
  if (demoSymbolPrices.has(symbol)) return demoSymbolPrices.get(symbol)!;
  const price = Math.floor((Math.random() * (50_000 - 500) + 500) * 100);
  demoSymbolPrices.set(symbol, price);
  return price;
}

// Build a collision-free real→fake symbol map from all unique symbols in the dataset.
// Sorts symbols for determinism, then assigns demo entries in order (cycling with a
// numeric suffix if there are more real symbols than demo entries).
export function buildDemoSymbolMap(
  realSymbols: string[],
): Map<string, { symbol: string; name: string }> {
  const unique = [...new Set(realSymbols)].sort();
  return new Map(unique.map((sym, i) => {
    const base = DEMO_HOLDINGS[i % DEMO_HOLDINGS.length];
    const cycle = Math.floor(i / DEMO_HOLDINGS.length);
    return [sym, { symbol: cycle === 0 ? base.symbol : `${base.symbol}${cycle + 1}`, name: base.name }];
  }));
}
