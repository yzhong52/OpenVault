import React from 'react';
import { Icon } from './Icons';

type Page = 'dashboard' | 'accounts';

interface SidebarProps {
  page: Page;
  setPage: (page: Page) => void;
}

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Overview', icon: 'overview' },
  { id: 'accounts',  label: 'Accounts',  icon: 'accounts'  },
];

const ACCENT = 260;

export function Sidebar({ page, setPage }: SidebarProps) {
  return (
    <div style={{
      width: 220, minHeight: '100vh',
      background: 'oklch(0.99 0.003 60)',
      borderRight: '1px solid oklch(0.92 0.005 260)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{
        padding: '20px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid oklch(0.93 0.005 260)', minHeight: 60,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: `oklch(0.55 0.18 ${ACCENT})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="4" width="12" height="8" rx="1.5" stroke="white" strokeWidth="1.3"/>
            <path d="M4 4V3a3 3 0 0 1 6 0v1" stroke="white" strokeWidth="1.3"/>
            <circle cx="7" cy="8" r="1.2" fill="white"/>
          </svg>
        </div>
        <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.02em' }}>OpenVault</span>
      </div>

      <nav style={{ padding: '10px 8px', flex: 1 }}>
        {NAV.map(item => {
          const active = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '9px 12px', marginBottom: 2,
                borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit', fontSize: 13.5, fontWeight: active ? 500 : 400,
                background: active ? `oklch(0.94 0.04 ${ACCENT})` : 'transparent',
                color: active ? `oklch(0.45 0.18 ${ACCENT})` : 'oklch(0.45 0.01 260)',
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'oklch(0.95 0.005 260)'; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <Icon name={item.icon} size={15}/>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: '12px 8px', borderTop: '1px solid oklch(0.93 0.005 260)' }}>
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '8px 12px',
            borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
            fontFamily: 'inherit', fontSize: 13, background: 'transparent',
            color: 'oklch(0.55 0.01 260)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'oklch(0.95 0.005 260)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <Icon name="sync" size={15}/>
          Sync all
        </button>
      </div>
    </div>
  );
}
