import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
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

export function Auth({ role, onLogin, forAdminCreation = false }: {
  role: Role; onLogin: (profile: Profile) => void; forAdminCreation?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const reducedMotion = useReducedMotion();
  const current = copy[role];
  const portal = role === 'HR_ADMIN' ? 'admin' : 'karyawan';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get('email') ?? '').trim();
    const password = String(fields.get('password') ?? '');
    setError('');
    const invalidEmail = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254;
    const invalidPassword = password.length < 8 || password.length > 128;
    setFieldErrors({
      email: invalidEmail ? 'Masukkan alamat email yang valid.' : undefined,
      password: invalidPassword ? 'Kata sandi harus berisi 8–128 karakter.' : undefined,
    });
    if (invalidEmail || invalidPassword) {
      form.querySelector<HTMLInputElement>(invalidEmail ? '[name="email"]' : '[name="password"]')?.focus();
      return;
    }
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
      <motion.div className="auth-content" initial={reducedMotion ? false : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : .22, ease: 'easeOut' }}>
        <header className="auth-heading">
          <h1 id="auth-heading">{forAdminCreation ? 'Buat akun Admin HR' : `Masuk ${current.role}`}</h1>
          <p>{forAdminCreation
            ? 'Masuk dengan akun Admin HR yang sudah aktif untuk membuat akun baru.'
            : role === 'HR_ADMIN' ? 'Gunakan akun Admin HR Anda.' : 'Gunakan akun yang diberikan oleh HR.'}</p>
        </header>
        <form className="auth-form" onSubmit={submit} aria-busy={busy} noValidate>
          <div className="form-field">
            <label htmlFor="auth-email">Email</label>
            <input id="auth-email" name="email" type="email" autoComplete="username"
              aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              onChange={() => setFieldErrors((current) => ({ ...current, email: undefined }))}
              placeholder="nama@perusahaan.co.id" required maxLength={254} />
            {fieldErrors.email && <span className="auth-field-error" id="email-error" role="alert">{fieldErrors.email}</span>}
          </div>
          <div className="form-field">
            <label htmlFor="auth-password">Kata sandi</label>
            <span className="password-field">
              <input id="auth-password" name="password" type={visible ? 'text' : 'password'} placeholder="Masukkan kata sandi"
                aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                onChange={() => setFieldErrors((current) => ({ ...current, password: undefined }))}
                autoComplete="current-password" minLength={8} maxLength={128} required />
              <button type="button" aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setVisible(!visible)}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2 12s3.6-5.5 10-5.5S22 12 22 12s-3.6 5.5-10 5.5S2 12 2 12Z" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.5"/>
                  {visible && <path d="m4 20 16-16" stroke="currentColor" strokeWidth="1.5"/>}
                </svg>
              </button>
            </span>
            {fieldErrors.password && <span className="auth-field-error" id="password-error" role="alert">{fieldErrors.password}</span>}
          </div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? 'Memproses…' : forAdminCreation ? 'Masuk dan lanjutkan' : 'Masuk'}</button>
        </form>
      </motion.div>
      <p className="auth-help">
        {forAdminCreation ? <Link to="/login/admin">Kembali ke halaman masuk</Link> : role === 'HR_ADMIN'
          ? <>Belum punya akun Admin HR? <Link to="/admin/accounts/new">Buat sekarang</Link></>
          : 'Butuh akses? Hubungi HR.'}
      </p>
    </section>
    <aside className="auth-hero" aria-label="Tentang portal">
      <div className="auth-editorial">
        <p className="auth-editorial-title">{current.title}</p>
        <p>{current.text}</p>
      </div>
    </aside>
  </main>;
}
