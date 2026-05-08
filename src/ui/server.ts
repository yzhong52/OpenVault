import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import * as fs from 'fs/promises';
import * as path from 'path';
import { openDb } from '../db';
import { listAccounts, getNetWorthHistory } from '../db/storage';

const app = new Hono();

// In demo mode, we assign a completely random stable balance ($5k - $150k) to each account
// to entirely decouple from real values and protect privacy.
const demoBalances = new Map<string, number>();

function getDemoBalance(accountId: string): number {
  if (!demoBalances.has(accountId)) {
    demoBalances.set(accountId, Math.floor((Math.random() * 145000 + 5000) * 100));
  }
  return demoBalances.get(accountId)!;
}

function applyDemoMask(name: string): string {
  // E.g. "Chequing 1234" -> "Chequing ••••"
  const masked = name.replace(/\d+/g, '••••');
  // If there were no digits, just append dots to show it's masked
  return masked === name ? `${name.split(' ')[0]} ••••` : masked;
}

app.get('/api/accounts', (c) => {
  const { db, close } = openDb();
  try {
    let accounts = listAccounts(db);

    const isDemo = c.req.query('demo') === '1';
    if (isDemo) {
      accounts = accounts.map(a => ({
        ...a,
        accountName: applyDemoMask(a.accountName),
        amountCents: a.amountCents !== null ? getDemoBalance(`${a.institutionName}/${a.accountName}`) : null,
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

    const isDemo = c.req.query('demo') === '1';
    if (isDemo && history.length > 0) {
      // Calculate the sum of all fake accounts to anchor the end of our fake chart,
      // guaranteeing the net worth chart perfectly matches the account table total
      const accounts = listAccounts(db);
      let runningTotal = accounts.reduce((sum, a) => 
        sum + (a.amountCents !== null ? getDemoBalance(`${a.institutionName}/${a.accountName}`) : 0)
      , 0);

      // Walk backwards through history, applying a random simulated market variance
      for (let i = history.length - 1; i >= 0; i--) {
        history[i].amountCents = runningTotal;
        // Going backwards: balance drops by -0.5% to +1.5% per day to simulate an upward trend
        const variance = (Math.random() * 0.02) - 0.005; 
        runningTotal = Math.floor(runningTotal * (1 - variance));
      }
    }

    return c.json(history);
  } finally {
    close();
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
    return c.text(content, 200, {
      'Content-Type': 'application/javascript',
    });
  } catch (err) {
    return c.text('Bundle not found. Ensure esbuild ran before starting the server.', 404);
  }
});

app.get('/', (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenVault</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { height: 100%; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: oklch(0.975 0.004 60);
      color: oklch(0.15 0.01 260);
      -webkit-font-smoothing: antialiased;
    }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: oklch(0.85 0.005 260); border-radius: 3px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="/dist/bundle.js"></script>
</body>
</html>`;
  
  return c.html(html);
});

const port = 3000;
console.log(`Starting OpenVault UI server on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port
});
