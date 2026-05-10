import { Icon } from './Icons';

export type Page = 'dashboard' | 'accounts' | 'transactions';

interface SidebarProps {
  page: Page;
  setPage: (page: Page) => void;
  demo: boolean;
  setDemo: (demo: boolean) => void;
}

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard',    label: 'Overview',     icon: 'overview'      },
  { id: 'accounts',     label: 'Accounts',     icon: 'accounts'      },
  { id: 'transactions', label: 'Transactions', icon: 'transactions'  },
];

const ACCENT = 260;

const DEMO_BG    = 'oklch(0.94 0.08 88)';
const DEMO_BG_HV = 'oklch(0.89 0.10 88)';
const DEMO_FG    = 'oklch(0.42 0.14 88)';

export function Sidebar({ page, setPage, demo, setDemo }: SidebarProps) {
  return (
    <div style={{
      width: 220, height: '100vh',
      background: 'oklch(0.99 0.003 60)',
      borderRight: '1px solid oklch(0.92 0.005 260)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{
        padding: '20px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid oklch(0.93 0.005 260)', minHeight: 60,
      }}>
        <img src="/favicon.png" alt="LedgerAgent" width={28} height={28} style={{ borderRadius: 8, flexShrink: 0 }}/>
        <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.02em' }}>LedgerAgent</span>
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
          onClick={() => setDemo(!demo)}
          title="Toggle demo mode"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '8px 12px',
            borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
            fontFamily: 'inherit', fontSize: 13,
            background: demo ? DEMO_BG : 'transparent',
            color: demo ? DEMO_FG : 'oklch(0.55 0.01 260)',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background =
              demo ? DEMO_BG_HV : 'oklch(0.95 0.005 260)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background =
              demo ? DEMO_BG : 'transparent';
          }}
        >
          <Icon name="demo" size={15}/>
          {demo ? 'Demo: On' : 'Demo: Off'}
        </button>
      </div>
    </div>
  );
}
