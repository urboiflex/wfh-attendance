import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Auth, Brand } from './Auth';
import { EmployeeWorkspace, HrWorkspace } from './Workspace';
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
      <Route path="/login/karyawan" element={profile ? <Navigate to="/portal" replace /> : <Auth key="karyawan" role="EMPLOYEE" onLogin={setProfile} />} />
      <Route path="/login/admin" element={profile ? <Navigate to="/portal" replace /> : <Auth key="admin" role="HR_ADMIN" onLogin={setProfile} />} />
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
