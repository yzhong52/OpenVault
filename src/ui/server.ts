import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import * as fs from 'fs/promises';
import * as path from 'path';
import { openDb } from '../db';
import { listAccounts, getNetWorthHistory } from '../db/storage';

const app = new Hono();

const isDemo = process.argv.includes('--demo');
// Generate a stable multiplier for the server session so the accounts table and net worth chart
// are scaled by the exact same random amount, keeping the data visually correlated.
const DEMO_MULTIPLIER = 0.3 + Math.random() * 1.5;

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

    if (isDemo) {
      accounts = accounts.map(a => ({
        ...a,
        accountName: applyDemoMask(a.accountName),
        amountCents: a.amountCents !== null ? Math.floor(a.amountCents * DEMO_MULTIPLIER) : null,
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

    if (isDemo) {
      history = history.map(h => ({
        ...h,
        amountCents: Math.floor(h.amountCents * DEMO_MULTIPLIER),
      }));
    }

    return c.json(history);
  } finally {
    close();
  }
});

app.get('/dist/bundle.js', async (c) => {
  const bundlePath = path.join(process.cwd(), 'src/ui/dist/bundle.js');
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
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f9fafb;
      color: #111827;
      margin: 0;
      padding: 40px 20px;
    }
    #root {
      max-width: 1000px;
      margin: 0 auto;
    }
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
console.log(`Starting OpenVault UI server on http://localhost:${port}${isDemo ? ' (DEMO MODE)' : ''}`);

serve({
  fetch: app.fetch,
  port
});
