import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { AccountRow, NetWorthPoint } from './api';
import { getInstColor, fmtCents, fmtCentsK } from './utils';
import { InstBadge } from './InstBadge';

const ACCENT = 260;

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12,
      border: '1px solid oklch(0.91 0.005 260)',
      padding: '20px 24px', flex: 1, minWidth: 0,
    }}>
      <div style={{
        fontSize: 12, color: 'oklch(0.55 0.01 260)', fontWeight: 500,
        letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 8,
      }}>{label}</div>
      <div style={{
        fontFamily: "'DM Mono', monospace", fontSize: 26, fontWeight: 500,
        letterSpacing: '-0.03em', marginBottom: 4,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: 'oklch(0.55 0.01 260)' }}>{sub}</div>}
    </div>
  );
}

function toMonthly(history: NetWorthPoint[]) {
  const byMonth = new Map<string, number>();
  for (const p of history) byMonth.set(p.date.slice(0, 7), p.amountCents);
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, cents]) => ({
      month: new Date(month + '-01T12:00:00').toLocaleDateString('en-CA', { month: 'short' }),
      valueCents: cents,
    }));
}

interface Props {
  accounts: AccountRow[];
  history: NetWorthPoint[];
}

export function Dashboard({ accounts, history }: Props) {
  const netWorthCents = accounts.reduce((s, a) => s + (a.amountCents ?? 0), 0);
  const assetsCents   = accounts.filter(a => (a.amountCents ?? 0) > 0).reduce((s, a) => s + (a.amountCents ?? 0), 0);
  const debtCents     = accounts.filter(a => (a.amountCents ?? 0) < 0).reduce((s, a) => s + (a.amountCents ?? 0), 0);
  const chartData     = toMonthly(history);
  const institutions  = Array.from(new Set(accounts.map(a => a.institutionName)));

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: '#fff', border: '1px solid oklch(0.91 0.005 260)',
        borderRadius: 8, padding: '8px 14px', fontSize: 13,
      }}>
        <div style={{ fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontFamily: "'DM Mono', monospace" }}>{fmtCentsK(payload[0].value)}</div>
      </div>
    );
  };

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em' }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: 'oklch(0.55 0.01 260)', marginTop: 3 }}>Your financial snapshot.</p>
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
        <StatCard label="Net Worth"    value={fmtCents(netWorthCents)} sub={`${accounts.length} account${accounts.length !== 1 ? 's' : ''}`}/>
        <StatCard label="Total Assets" value={fmtCents(assetsCents)}/>
        <StatCard label="Total Debt"   value={fmtCents(Math.abs(debtCents))}/>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <div style={{
          background: '#fff', borderRadius: 12,
          border: '1px solid oklch(0.91 0.005 260)', padding: '22px 24px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 18, color: 'oklch(0.35 0.01 260)' }}>
            Net Worth
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={`oklch(0.55 0.18 ${ACCENT})`} stopOpacity={0.15}/>
                    <stop offset="100%" stopColor={`oklch(0.55 0.18 ${ACCENT})`} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.93 0.005 260)" vertical={false}/>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'oklch(0.6 0.01 260)' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  dataKey="valueCents"
                  tick={{ fontSize: 11, fill: 'oklch(0.6 0.01 260)', fontFamily: "'DM Mono', monospace" }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => `$${(v / 100000).toFixed(0)}k`}
                  width={42}
                />
                <Tooltip content={<ChartTooltip/>}/>
                <Area
                  type="monotone" dataKey="valueCents"
                  stroke={`oklch(0.55 0.18 ${ACCENT})`} strokeWidth={2}
                  fill="url(#nwGrad)" dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{
              height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'oklch(0.6 0.01 260)', fontSize: 13,
            }}>
              No history yet — run a sync to populate the chart.
            </div>
          )}
        </div>

        <div style={{
          background: '#fff', borderRadius: 12,
          border: '1px solid oklch(0.91 0.005 260)', padding: '22px 24px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 18, color: 'oklch(0.35 0.01 260)' }}>
            Accounts
          </div>
          {institutions.length === 0 ? (
            <div style={{ fontSize: 13, color: 'oklch(0.6 0.01 260)' }}>
              No accounts yet — run a sync to get started.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {institutions.map(inst => {
                const bal = accounts
                  .filter(a => a.institutionName === inst && (a.amountCents ?? 0) > 0)
                  .reduce((s, a) => s + (a.amountCents ?? 0), 0);
                const pct = assetsCents > 0 ? Math.round(bal / assetsCents * 100) : 0;
                return (
                  <div key={inst} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <InstBadge name={inst} size={24}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4,
                      }}>
                        <span style={{ fontWeight: 500 }}>{inst}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", color: 'oklch(0.35 0.01 260)' }}>
                          {fmtCentsK(bal)}
                        </span>
                      </div>
                      <div style={{
                        height: 4, borderRadius: 2,
                        background: 'oklch(0.93 0.005 260)', overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: getInstColor(inst), borderRadius: 2,
                        }}/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
