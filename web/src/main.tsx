import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { Auth } from './Auth';
import { EmployeeWorkspace, HrWorkspace } from './Workspace';
import { WorkspaceSettings, WorkspaceShell } from './WorkspaceShell';
import { api, ApiError, errorMessage, type Profile } from './client';
import './style.css';

function App() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  function loadSession(signal?: AbortSignal) {
    setStatus('');
    api<Profile>('/auth/me', { signal })
      .then(setProfile)
      .catch((failure) => {
        if (signal?.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) setProfile(null);
        else {
          setProfile(null);
          setStatus(errorMessage(failure));
        }
      });
  }

  useEffect(() => {
    const controller = new AbortController();
    loadSession(controller.signal);
    return () => controller.abort();
  }, []);

  if (profile === undefined) return <p className="session-loading" role="status">Memuat Ruang Kerja…</p>;
  const isAdmin = profile?.role === 'HR_ADMIN';
  const isEmployee = profile?.role === 'EMPLOYEE';
  const portal = profile?.role === 'HR_ADMIN' ? 'admin' : 'karyawan';
  const dashboard = profile ? `/${portal}` : '/login/karyawan';

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' });
      setProfile(null);
      navigate(`/login/${portal}`, { replace: true });
    } catch (failure) {
      setStatus(errorMessage(failure));
    }
  }

  const workspace = profile ? <WorkspaceShell key={profile.id} profile={profile} onSignOut={signOut} /> : null;

  return <>
    {status && <div className="app-alert" role="alert">{status}<button onClick={() => loadSession()}>Coba lagi</button></div>}
    <Routes>
      <Route path="/login/karyawan" element={isEmployee ? <Navigate to="/karyawan" replace /> : <Auth key="karyawan" role="EMPLOYEE" onLogin={setProfile} />} />
      <Route path="/login/admin" element={isAdmin ? <Navigate to="/admin" replace /> : <Auth key="admin" role="HR_ADMIN" onLogin={setProfile} />} />
      <Route path="/karyawan" element={isEmployee ? workspace : <Navigate to="/login/karyawan" replace />}>
        <Route index element={<EmployeeWorkspace />} />
        <Route path="settings" element={<WorkspaceSettings />} />
      </Route>
      <Route path="/admin" element={isAdmin ? workspace : <Outlet />}>
        <Route index element={isAdmin ? <HrWorkspace view="employees" /> : <Navigate to="/login/admin" replace />} />
        <Route path="attendance" element={isAdmin ? <HrWorkspace view="attendance" /> : <Navigate to="/login/admin" replace />} />
        <Route path="accounts/new" element={isAdmin ? <HrWorkspace view="admins" />
          : <Auth key="create-admin" role="HR_ADMIN" forAdminCreation onLogin={setProfile} />} />
        <Route path="settings" element={isAdmin ? <WorkspaceSettings /> : <Navigate to="/login/admin" replace />} />
      </Route>
      <Route path="/settings" element={<Navigate to={profile ? `/${portal}/settings` : '/login/karyawan'} replace />} />
      <Route path="/portal" element={<Navigate to={dashboard} replace />} />
      <Route path="*" element={<Navigate to={dashboard} replace />} />
    </Routes>
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>);
