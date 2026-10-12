import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api';
import { Loading, ToastProvider } from './components/ui';
import { AuthScreen } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Processing from './pages/Processing';
import VdpReview from './pages/VdpReview';
import Vdps from './pages/Vdps';
import { ProviderList, ProviderProfile, ProviderEdit } from './pages/Providers';
import Divisions from './pages/Divisions';
import { PlanList, PlanDetail } from './pages/Plans';
import Cycles from './pages/Cycles';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import LiftLeases from './pages/LiftLeases';
import PortalShell from './pages/Portal';
import Configuration from './pages/Configuration';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const NAV = [
  ['/', 'Home', '⌂'],
  ['/processing', 'Processing', '▶'],
  ['/vdps', 'VDPs', '▣'],
  ['/providers', 'Providers', '◉'],
  ['/reports', 'Reports', '▥'],
  ['/configuration', 'Configuration', '⚙'],
];

function RouteScrollMemory() {
  const location = useLocation();
  useLayoutEffect(() => {
    const key = `vdp.scroll:${location.pathname}${location.search}`;
    let top = 0;
    try { top = Number(sessionStorage.getItem(key) || 0); } catch { /* storage may be unavailable */ }
    requestAnimationFrame(() => window.scrollTo(0, top));
    return () => { try { sessionStorage.setItem(key, String(window.scrollY)); } catch { /* storage may be unavailable */ } };
  }, [location.key, location.pathname, location.search]);
  return null;
}

function Shell({ user, onLogout }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span className="brand-star">★</span> Big Star VDP</div>
          <div className="brand-sub">Vendor Direct Payments</div>
        </div>
        <nav className="nav">
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <span className="nav-icon" aria-hidden>{icon}</span>{label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div style={{ color: '#fff', fontWeight: 600 }}>{user.name}</div>
          <div style={{ marginBottom: 6 }}>{user.role === 'ADMIN' ? 'Administrator' : user.role === 'NSM' ? 'NSM' : 'Accounting'}</div>
          <button type="button" onClick={onLogout}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        <RouteScrollMemory />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/processing" element={<Processing />} />
          <Route path="/vdps" element={<Vdps />} />
          <Route path="/vdp-history" element={<Navigate to="/vdps" replace />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/vdps/:id" element={<VdpReview />} />
          <Route path="/providers" element={<ProviderList />} />
          <Route path="/providers/new" element={<ProviderEdit />} />
          <Route path="/providers/:id" element={<ProviderProfile />} />
          <Route path="/providers/:id/edit" element={<ProviderEdit />} />
          <Route path="/configuration" element={<Configuration />} />
          <Route path="/configuration/lift-leases" element={<LiftLeases />} />
          <Route path="/configuration/divisions" element={<Divisions />} />
          <Route path="/configuration/plans" element={<PlanList />} />
          <Route path="/configuration/plans/:id" element={<PlanDetail />} />
          <Route path="/configuration/cycles" element={<Cycles />} />
          <Route path="/configuration/system" element={<Settings />} />
          <Route path="/lift-leases" element={<Navigate to="/configuration/lift-leases" replace />} />
          <Route path="/divisions" element={<Navigate to="/configuration/divisions" replace />} />
          <Route path="/plans" element={<PlanList />} />
          <Route path="/plans/:id" element={<PlanDetail />} />
          <Route path="/cycles" element={<Navigate to="/configuration/cycles" replace />} />
          <Route path="/settings" element={<Navigate to="/configuration/system" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState({ loading: true, user: null, needsSetup: false });

  const refresh = async () => {
    try {
      const user = await api.get('/auth/me');
      setState({ loading: false, user, needsSetup: false });
    } catch {
      const { needsSetup } = await api.get('/auth/status').catch(() => ({ needsSetup: false }));
      setState({ loading: false, user: null, needsSetup });
    }
  };

  useEffect(() => {
    refresh();
    const onUnauthorized = () => setState((s) => ({ ...s, user: null }));
    window.addEventListener('vdp:unauthorized', onUnauthorized);
    return () => window.removeEventListener('vdp:unauthorized', onUnauthorized);
  }, []);

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setState({ loading: false, user: null, needsSetup: false });
  };

  if (state.loading) return <Loading />;

  return (
    <ToastProvider>
      <AuthContext.Provider value={{ user: state.user, refresh }}>
        {state.user ? (
          <BrowserRouter>
            {state.user.role === 'PROVIDER'
              ? <PortalShell user={state.user} onLogout={logout} />
              : <Shell user={state.user} onLogout={logout} />}
          </BrowserRouter>
        ) : (
          <AuthScreen needsSetup={state.needsSetup} onDone={refresh} />
        )}
      </AuthContext.Provider>
    </ToastProvider>
  );
}
