import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import * as fs from 'fs/promises';
import * as path from 'path';
import { openDb } from '../db';
import { listAccounts, getNetWorthHistory, listTransactions, listHoldings } from '../db/storage';
import { getDemoBalance, applyDemoMask } from './demo/accounts';
import { getDemoSymbolPrice, buildDemoSymbolMap } from './demo/holdings';
import { generateDemoTransactions } from './demo/transactions';

const app = new Hono();

app.get('/api/accounts', (c) => {
  const { db, close } = openDb();
  try {
    let accounts = listAccounts(db);

    const demo = !!c.req.query('demo');
    if (demo) {
      accounts = accounts.map(a => ({
        ...a,
        accountId: applyDemoMask(a.accountId),
        accountName: applyDemoMask(a.accountName),
        amountCents: a.amountCents !== null
          ? getDemoBalance(`${a.institutionName}/${a.accountName}`, a.accountType)
          : null,
      }));
    }

    return c.json(accounts);
  } finally {
    close();
  }
});

app.get('/api/net-worth', (c) => {
  const { db, close } = openDb();
  try {
    let history = getNetWorthHistory(db);

    const demo = !!c.req.query('demo');
    if (demo) {
      // Anchor the chart end to the sum of fake balances so chart and cards always agree.
      const accounts = listAccounts(db);
      let runningTotal = accounts.reduce((sum, a) =>
        sum + (a.amountCents !== null
          ? getDemoBalance(`${a.institutionName}/${a.accountName}`, a.accountType)
          : 0)
      , 0);
      if (runningTotal === 0) runningTotal = 15_000_000_00;

      // Generate 365 days of synthetic history ending today, simulating an upward trend
      const today = new Date();
      const points = [];
      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        points.push({ date: d.toISOString().slice(0, 10), amountCents: runningTotal });
        const variance = (Math.random() * 0.02) - 0.005;
        runningTotal = Math.floor(runningTotal * (1 - variance));
      }
      history = points.reverse();
    }

    return c.json(history);
  } finally {
    close();
  }
});

app.get('/api/transactions', (c) => {
  const demo = !!c.req.query('demo');
  const daysParam = c.req.query('days');
  const days = daysParam ? parseInt(daysParam, 10) : 90;

  if (demo) {
    return c.json(generateDemoTransactions());
  }

  const { db, close } = openDb();
  try {
    return c.json(listTransactions(db, { days }));
  } finally {
    close();
  }
});

app.get('/api/holdings', (c) => {
  const demo = !!c.req.query('demo');
  const { db, close } = openDb();
  try {
    let rows = listHoldings(db);
    if (demo) {
      const symbolMap = buildDemoSymbolMap(rows.map(r => r.symbol));
      rows = rows.map(h => {
        const fake = symbolMap.get(h.symbol)!;
        const price = getDemoSymbolPrice(h.symbol);
        const mv = Math.round(price * Math.max(h.quantity, 1));
        return {
          ...h,
          symbol: fake.symbol,
          name: fake.name,
          pricePerUnitCents: price,
          marketValueCents: mv,
          costBasisCents: h.costBasisCents != null ? Math.round(mv * 0.85) : null,
        };
      });
    }
    return c.json(rows);
  } finally {
    close();
  }
});

app.get('/favicon.png', async (c) => {
  const iconPath = path.join(process.cwd(), 'src/ui/public/LedgerAgent.png');
  try {
    const content = await fs.readFile(iconPath);
    return c.body(content as unknown as ReadableStream, 200, { 'Content-Type': 'image/png' });
  } catch {
    return c.notFound();
  }
});

app.get('/icons/:file', async (c) => {
  const file = c.req.param('file');
  const iconPath = path.join(process.cwd(), 'src/ui/public/icons', file);
  try {
    const content = await fs.readFile(iconPath);
    return c.body(content as unknown as ReadableStream, 200, { 'Content-Type': 'image/png' });
  } catch {
    return c.notFound();
  }
});

app.get('/dist/bundle.js', async (c) => {
  const bundlePath = path.join(process.cwd(), 'dist/ui/bundle.js');
  try {
    const content = await fs.readFile(bundlePath, 'utf8');
    return c.text(content, 200, { 'Content-Type': 'application/javascript' });
  } catch {
    return c.text('Bundle not found. Ensure esbuild ran before starting the server.', 404);
  }
});

async function serveIndex(c: Context) {
  const htmlPath = path.join(process.cwd(), 'src/ui/public/index.html');
  try {
    const content = await fs.readFile(htmlPath, 'utf8');
    return c.html(content);
  } catch {
    return c.text('index.html not found.', 404);
  }
}

app.get('/', (c) => serveIndex(c));
app.get('/accounts', (c) => serveIndex(c));
app.get('/holdings', (c) => serveIndex(c));
app.get('/transactions', (c) => serveIndex(c));

const port = Number(process.env.PORT) || 3000;
console.log(`Starting LedgerAgent UI server on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
