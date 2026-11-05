import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Auth, Brand } from './Auth';
import { EmployeeWorkspace, HrWorkspace } from './Workspace';
import { api, ApiError, errorMessage, type Profile } from './client';
import './style.css';

function AuthRoute({ signup, onLogin }: { signup: boolean; onLogin: (profile: Profile) => void }) {
  const { kind } = useParams();
  const location = useLocation();
  if (kind !== 'karyawan' && kind !== 'admin') return <Navigate to="/login/karyawan" replace />;
  return <Auth key={location.pathname} role={kind === 'admin' ? 'HR_ADMIN' : 'EMPLOYEE'} signup={signup}
    onLogin={onLogin} notice={location.state?.notice} />;
}

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
  const portal = profile?.role === 'HR_ADMIN' ? 'admin' : 'karyawan';

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' });
      setProfile(null);
      navigate(`/login/${portal}`, { replace: true });
    } catch (failure) {
      setStatus(errorMessage(failure));
    }
  }

  return <>
    {status && <div className="app-alert" role="alert">{status}<button onClick={() => loadSession()}>Coba lagi</button></div>}
    <Routes>
      <Route path="/login/:kind" element={profile ? <Navigate to="/portal" replace /> : <AuthRoute signup={false} onLogin={setProfile} />} />
      <Route path="/signup/:kind" element={profile ? <Navigate to="/portal" replace /> : <AuthRoute signup onLogin={setProfile} />} />
      <Route path="/portal" element={profile ? <div className={`workspace ${portal === 'admin' ? 'silver' : 'blue'}`}>
        <header className="workspace-header"><Brand /><div><span>{profile.displayName}</span>
          <button className="secondary" onClick={signOut}>Keluar</button></div></header>
        {portal === 'admin' ? <HrWorkspace /> : <EmployeeWorkspace />}
      </div> : <Navigate to="/login/karyawan" replace />} />
      <Route path="*" element={<Navigate to={profile ? '/portal' : '/login/karyawan'} replace />} />
    </Routes>
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>);
