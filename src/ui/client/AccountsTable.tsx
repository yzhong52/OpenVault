import { useState } from 'react';
import type { AccountRow } from './api';
import { fmtCents } from './utils';
import { Icon } from './Icons';
import { InstBadge } from './InstBadge';

export function AccountsPage({ accounts }: { accounts: AccountRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const institutions = Array.from(new Set(accounts.map(a => a.institutionName)));

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em' }}>Accounts</h1>
        <p style={{ fontSize: 14, color: 'oklch(0.55 0.01 260)', marginTop: 3 }}>
          {accounts.length} account{accounts.length !== 1 ? 's' : ''} across{' '}
          {institutions.length} institution{institutions.length !== 1 ? 's' : ''}
        </p>
      </div>

      {accounts.length === 0 && (
        <div style={{
          background: '#fff', borderRadius: 12,
          border: '1px solid oklch(0.91 0.005 260)',
          padding: '40px 24px', textAlign: 'center',
          color: 'oklch(0.6 0.01 260)', fontSize: 14,
        }}>
          No accounts yet — run <code style={{ fontFamily: "'DM Mono', monospace" }}>sync</code> to get started.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {institutions.map(inst => {
          const accts = accounts.filter(a => a.institutionName === inst);
          const total = accts.reduce((s, a) => s + (a.amountCents ?? 0), 0);
          const open  = expanded === inst;

          return (
            <div key={inst} style={{
              background: '#fff', borderRadius: 12,
              border: '1px solid oklch(0.91 0.005 260)', overflow: 'hidden',
            }}>
              <button
                onClick={() => setExpanded(open ? null : inst)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  width: '100%', padding: '16px 22px',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'oklch(0.98 0.003 60)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <InstBadge name={inst} size={36}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{inst}</div>
                  <div style={{ fontSize: 12.5, color: 'oklch(0.6 0.01 260)', marginTop: 2 }}>
                    {accts.length} account{accts.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ marginRight: 8 }}>
                  <div style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 17, fontWeight: 500,
                    color: total >= 0 ? 'oklch(0.15 0.01 260)' : 'oklch(0.5 0.15 20)',
                  }}>
                    {fmtCents(total)}
                  </div>
                </div>
                <div style={{
                  transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.18s', color: 'oklch(0.6 0.01 260)',
                }}>
                  <Icon name="chevron" size={16}/>
                </div>
              </button>

              {open && (
                <div style={{ borderTop: '1px solid oklch(0.93 0.005 260)' }}>
                  {accts.map((a, i) => (
                    <div key={a.accountId} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '13px 22px 13px 72px',
                      borderBottom: i < accts.length - 1 ? '1px solid oklch(0.95 0.003 260)' : 'none',
                      background: 'oklch(0.985 0.003 60)',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{a.accountName}</div>
                        <div style={{ fontSize: 12, color: 'oklch(0.6 0.01 260)', marginTop: 1 }}>
                          {[a.accountType, a.accountCurrency].filter(Boolean).join(' · ')}
                          {a.latestDate && ` · synced ${a.latestDate}`}
                        </div>
                      </div>
                      <div style={{
                        fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 500,
                        color: (a.amountCents ?? 0) >= 0 ? 'oklch(0.15 0.01 260)' : 'oklch(0.5 0.15 20)',
                      }}>
                        {fmtCents(a.amountCents)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
