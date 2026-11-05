import { useState, type FormEvent } from 'react';
import { api, errorMessage, json, type Profile, type Role } from './client';
import './auth.css';

export function Brand() {
  return <span className="brand">
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <rect width="34" height="34" rx="10" fill="currentColor" fillOpacity=".15"/>
      <path d="M9.5 16.8 17 10l7.5 6.8v7.7h-15z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="m13.6 18.8 2.2 2.2 4.8-4.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    Ruang Kerja
  </span>;
}

const copy = {
  EMPLOYEE: {
    role: 'Karyawan',
    title: 'Absensi dari rumah.',
    text: 'Unggah foto bukti kerja. Tanggal dan jam absensi tercatat otomatis.',
  },
  HR_ADMIN: {
    role: 'Admin HR',
    title: 'Kehadiran tim, dalam satu tampilan.',
    text: 'Kelola akun karyawan dan tinjau bukti absensi WFH.',
  },
};

export function Auth({ role, onLogin }: {
  role: Role; onLogin: (profile: Profile) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = copy[role];
  const portal = role === 'HR_ADMIN' ? 'admin' : 'karyawan';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = fields.get('email');
    const password = fields.get('password');
    setError('');
    setBusy(true);
    try {
      onLogin(await api<Profile>(`/auth/${portal}/login`, json('POST', { email, password })));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return <main className={`auth-layout ${role === 'HR_ADMIN' ? 'silver' : 'blue'}`}>
    <section className="auth-panel" aria-labelledby="auth-heading">
      <header className="auth-brand"><Brand /></header>
      <div className="auth-content">
        <header className="auth-heading">
          <h1 id="auth-heading">Masuk {current.role}</h1>
          <p>{role === 'HR_ADMIN' ? 'Gunakan akun Admin HR Anda.' : 'Gunakan akun yang diberikan oleh HR.'}</p>
        </header>
        <form className="auth-form" onSubmit={submit} aria-busy={busy}>
          <label>Email
            <input name="email" type="email" autoComplete="username"
              placeholder="nama@perusahaan.co.id" required maxLength={254} />
          </label>
          <div className="form-field">
            <label htmlFor="auth-password">Kata sandi</label>
            <span className="password-field">
              <input id="auth-password" name="password" type={visible ? 'text' : 'password'} placeholder="Masukkan kata sandi"
                autoComplete="current-password" maxLength={128} required />
              <button type="button" aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setVisible(!visible)}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2 12s3.6-5.5 10-5.5S22 12 22 12s-3.6 5.5-10 5.5S2 12 2 12Z" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.5"/>
                  {visible && <path d="m4 20 16-16" stroke="currentColor" strokeWidth="1.5"/>}
                </svg>
              </button>
            </span>
          </div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? 'Memproses…' : 'Masuk'}</button>
        </form>
      </div>
      <p className="auth-help">{role === 'HR_ADMIN' ? 'Akses khusus Admin HR.' : 'Butuh akses? Hubungi HR.'}</p>
    </section>
    <aside className="auth-hero" aria-label="Tentang portal">
      <div className="auth-editorial">
        <p className="auth-editorial-title">{current.title}</p>
        <p>{current.text}</p>
      </div>
    </aside>
  </main>;
}
