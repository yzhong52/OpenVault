import { useState } from 'react';
import type { HoldingRow } from './api';
import { fmtCents } from './utils';
import { InstBadge } from './InstBadge';
import { Icon } from './Icons';

interface Props {
  holdings: HoldingRow[];
}

type GroupBy = 'symbol' | 'account';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const COLS = '20px 90px 1fr 90px 120px 130px 120px';
const SUB_COLS = '20px 90px 1fr 90px 120px 130px 120px';

function fmtQty(q: number): string {
  return q.toLocaleString('en-CA', { maximumFractionDigits: 4 });
}

function gainLossText(gl: number | null): string {
  if (gl === null) return '—';
  return (gl >= 0 ? '+' : '') + fmtCents(gl);
}

function gainLossColor(gl: number | null): string {
  if (gl === null) return 'var(--text-tertiary)';
  return gl >= 0 ? 'var(--text-positive)' : 'var(--text-negative)';
}

function TableHeader() {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: COLS,
      padding: '9px 20px',
      borderBottom: '1px solid var(--border-row)',
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      textTransform: 'uppercase', color: 'var(--text-secondary)',
    }}>
      <span/>
      <span>Symbol</span>
      <span>Name</span>
      <span style={{ textAlign: 'right' }}>Qty</span>
      <span style={{ textAlign: 'right' }}>Price / unit</span>
      <span style={{ textAlign: 'right' }}>Market Value</span>
      <span style={{ textAlign: 'right' }}>Gain / Loss</span>
    </div>
  );
}

function GroupToggle({ value, onChange }: { value: GroupBy; onChange: (v: GroupBy) => void }) {
  const btn = (id: GroupBy, label: string) => (
    <button
      onClick={() => onChange(id)}
      style={{
        padding: '5px 12px', fontSize: 12.5, fontWeight: value === id ? 500 : 400,
        border: 'none', cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
        background: value === id ? 'var(--bg-nav-active)' : 'transparent',
        color: value === id ? 'var(--text-nav-active)' : 'var(--text-secondary)',
        transition: 'background 0.12s, color 0.12s',
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{
      display: 'flex', gap: 2, padding: 3,
      background: 'var(--bg-sidebar)', borderRadius: 8,
      border: '1px solid var(--border-subtle)',
    }}>
      {btn('symbol', 'By Symbol')}
      {btn('account', 'By Account')}
    </div>
  );
}

// ── Symbol-grouped view ──────────────────────────────────────────────────────

interface SymbolGroup {
  symbol: string;
  name: string | null;
  totalQty: number;
  pricePerUnitCents: number;
  totalMvCents: number;
  totalGainLoss: number | null;
  rows: HoldingRow[];
}

function buildSymbolGroups(holdings: HoldingRow[]): SymbolGroup[] {
  const map = new Map<string, HoldingRow[]>();
  for (const h of holdings) {
    if (!map.has(h.symbol)) map.set(h.symbol, []);
    map.get(h.symbol)!.push(h);
  }
  return Array.from(map.entries()).map(([symbol, rows]) => {
    const allHaveCostBasis = rows.every(h => h.costBasisCents != null);
    return {
      symbol,
      name: rows[0].name ?? null,
      totalQty: rows.reduce((s, h) => s + h.quantity, 0),
      pricePerUnitCents: rows[0].pricePerUnitCents,
      totalMvCents: rows.reduce((s, h) => s + h.marketValueCents, 0),
      totalGainLoss: allHaveCostBasis
        ? rows.reduce((s, h) => s + h.marketValueCents - h.costBasisCents!, 0)
        : null,
      rows,
    };
  });
}

function SymbolGroupedView({ holdings }: { holdings: HoldingRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const groups = buildSymbolGroups(holdings);

  function toggle(symbol: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(symbol) ? next.delete(symbol) : next.add(symbol);
      return next;
    });
  }

  const totalMv = holdings.reduce((s, h) => s + h.marketValueCents, 0);
  const allHaveCostBasis = holdings.every(h => h.costBasisCents != null);
  const totalGl = allHaveCostBasis
    ? holdings.reduce((s, h) => s + h.marketValueCents - h.costBasisCents!, 0)
    : null;

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-card)', overflow: 'hidden' }}>
      <TableHeader/>
      {groups.map((g, gi) => {
        const isExpanded = expanded.has(g.symbol);
        const isLast = gi === groups.length - 1;
        const gl = g.totalGainLoss;
        return (
          <div key={g.symbol}>
            <div
              onClick={() => toggle(g.symbol)}
              style={{
                display: 'grid', gridTemplateColumns: COLS,
                padding: '13px 20px', alignItems: 'center',
                borderBottom: !isLast || isExpanded ? '1px solid var(--border-row)' : 'none',
                cursor: 'pointer',
              }}
            >
              <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                <span style={{ transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-flex' }}>
                  <Icon name="chevron" size={13}/>
                </span>
              </span>
              <span style={{ ...MONO, fontWeight: 600, fontSize: 13 }}>{g.symbol}</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 16 }}>
                {g.name ?? '—'}
              </span>
              <span style={{ ...MONO, fontSize: 13, textAlign: 'right' }}>{fmtQty(g.totalQty)}</span>
              <span style={{ ...MONO, fontSize: 13, textAlign: 'right' }}>{fmtCents(g.pricePerUnitCents)}</span>
              <span style={{ ...MONO, fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{fmtCents(g.totalMvCents)}</span>
              <span style={{ ...MONO, fontSize: 13, textAlign: 'right', color: gainLossColor(gl) }}>{gainLossText(gl)}</span>
            </div>

            {isExpanded && g.rows.map((h, hi) => {
              const hgl = h.costBasisCents != null ? h.marketValueCents - h.costBasisCents : null;
              const subLast = hi === g.rows.length - 1;
              return (
                <div key={`${h.institutionName}::${h.accountName}`} style={{
                  display: 'grid', gridTemplateColumns: SUB_COLS,
                  padding: '10px 20px', alignItems: 'center',
                  background: 'var(--bg-sidebar)',
                  borderBottom: !subLast || !isLast ? '1px solid var(--border-row)' : 'none',
                }}>
                  <span/>
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    <InstBadge name={h.institutionName} size={20}/>
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', paddingRight: 16 }}>
                    {h.accountName}
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>{h.institutionName}</span>
                  </span>
                  <span style={{ ...MONO, fontSize: 12.5, textAlign: 'right' }}>{fmtQty(h.quantity)}</span>
                  <span style={{ ...MONO, fontSize: 12.5, textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtCents(h.pricePerUnitCents)}</span>
                  <span style={{ ...MONO, fontSize: 12.5, textAlign: 'right' }}>{fmtCents(h.marketValueCents)}</span>
                  <span style={{ ...MONO, fontSize: 12.5, textAlign: 'right', color: gainLossColor(hgl) }}>{gainLossText(hgl)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
      <div style={{
        display: 'grid', gridTemplateColumns: COLS,
        padding: '11px 20px',
        borderTop: '1px solid var(--border-row)',
        background: 'var(--bg-sidebar)',
        fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
      }}>
        <span/><span/><span>Total</span><span/>
        <span/>
        <span style={{ ...MONO, textAlign: 'right', color: 'var(--text-primary)' }}>{fmtCents(totalMv)}</span>
        <span style={{ ...MONO, textAlign: 'right', color: gainLossColor(totalGl) }}>{gainLossText(totalGl)}</span>
      </div>
    </div>
  );
}

// ── Account-grouped view ─────────────────────────────────────────────────────

function AccountGroupedView({ holdings }: { holdings: HoldingRow[] }) {
  const grouped = new Map<string, HoldingRow[]>();
  for (const h of holdings) {
    const key = `${h.institutionName}::${h.accountName}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(h);
  }
  const groups = Array.from(grouped.entries());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {groups.map(([key, rows]) => {
        const [institutionName, accountName] = key.split('::');
        const accountTotal = rows.reduce((s, h) => s + h.marketValueCents, 0);
        const accountGl = rows.every(h => h.costBasisCents != null)
          ? rows.reduce((s, h) => s + h.marketValueCents - h.costBasisCents!, 0)
          : null;

        return (
          <div key={key}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 8, padding: '0 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <InstBadge name={institutionName} size={28}/>
                <div>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{accountName}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{institutionName}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                {accountGl != null && (
                  <span style={{ ...MONO, fontSize: 12, color: gainLossColor(accountGl) }}>
                    {gainLossText(accountGl)}
                  </span>
                )}
                <span style={{ ...MONO, fontSize: 13, fontWeight: 500 }}>{fmtCents(accountTotal)}</span>
              </div>
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-card)', overflow: 'hidden' }}>
              <TableHeader/>
              {rows.map((h, i) => {
                const gl = h.costBasisCents != null ? h.marketValueCents - h.costBasisCents : null;
                return (
                  <div key={h.symbol} style={{
                    display: 'grid', gridTemplateColumns: COLS,
                    padding: '13px 20px', alignItems: 'center',
                    borderBottom: i < rows.length - 1 ? '1px solid var(--border-row)' : 'none',
                  }}>
                    <span/>
                    <span style={{ ...MONO, fontWeight: 600, fontSize: 13 }}>{h.symbol}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 16 }}>
                      {h.name ?? '—'}
                    </span>
                    <span style={{ ...MONO, fontSize: 13, textAlign: 'right' }}>{fmtQty(h.quantity)}</span>
                    <span style={{ ...MONO, fontSize: 13, textAlign: 'right' }}>{fmtCents(h.pricePerUnitCents)}</span>
                    <span style={{ ...MONO, fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{fmtCents(h.marketValueCents)}</span>
                    <span style={{ ...MONO, fontSize: 13, textAlign: 'right', color: gainLossColor(gl) }}>{gainLossText(gl)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function HoldingsPage({ holdings }: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>('symbol');
  const totalMv = holdings.reduce((s, h) => s + h.marketValueCents, 0);

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em' }}>Holdings</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 3 }}>
            {holdings.length} position{holdings.length !== 1 ? 's' : ''}
            {holdings.length > 0 && ` · ${fmtCents(totalMv)} total`}
          </p>
        </div>
        {holdings.length > 0 && <GroupToggle value={groupBy} onChange={setGroupBy}/>}
      </div>

      {holdings.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', borderRadius: 12,
          border: '1px solid var(--border-card)',
          padding: '40px 24px', textAlign: 'center',
          color: 'var(--text-tertiary)', fontSize: 14,
        }}>
          No holdings yet — run a sync on a brokerage account to get started.
        </div>
      ) : groupBy === 'symbol' ? (
        <SymbolGroupedView holdings={holdings}/>
      ) : (
        <AccountGroupedView holdings={holdings}/>
      )}
    </div>
  );
}
