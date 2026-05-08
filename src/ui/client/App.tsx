import { useEffect, useState } from 'react';
import { fetchAccounts, fetchNetWorth, type AccountRow, type NetWorthPoint } from './api';
import { Sidebar } from './Sidebar';
import { Dashboard } from './Dashboard';
import { AccountsPage } from './AccountsTable';

type Page = 'dashboard' | 'accounts';

export function App() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [history,  setHistory]  = useState<NetWorthPoint[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [page,     setPage]     = useState<Page>('dashboard');

  useEffect(() => {
    Promise.all([fetchAccounts(), fetchNetWorth()])
      .then(([accs, hist]) => { setAccounts(accs); setHistory(hist); })
      .catch(err => { console.error(err); setError(err.message); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar page={page} setPage={setPage}/>
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 60 }}>
        {loading && (
          <div style={{ padding: '32px 36px', color: 'oklch(0.6 0.01 260)', fontSize: 14 }}>
            Loading…
          </div>
        )}
        {error && (
          <div style={{ padding: '32px 36px', color: 'oklch(0.5 0.15 20)', fontSize: 14 }}>
            Error: {error}
          </div>
        )}
        {!loading && !error && page === 'dashboard' && (
          <Dashboard accounts={accounts} history={history}/>
        )}
        {!loading && !error && page === 'accounts' && (
          <AccountsPage accounts={accounts}/>
        )}
      </main>
    </div>
  );
}
