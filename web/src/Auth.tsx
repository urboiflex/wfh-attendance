import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage, json, type Profile, type Role } from './client';

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
    title: 'Mulai hari kerjamu.',
    text: 'Absen dari rumah dengan foto dan waktu yang tercatat otomatis.',
    steps: ['Aktifkan akun', 'Unggah foto', 'Absensi tercatat'],
  },
  HR_ADMIN: {
    role: 'Admin HR',
    title: 'Pantau kehadiran tim.',
    text: 'Kelola data karyawan dan lihat bukti absensi WFH dalam satu tempat.',
    steps: ['Aktifkan akses', 'Kelola karyawan', 'Tinjau absensi'],
  },
};

export function Auth({ role, signup, onLogin, notice }: {
  role: Role; signup: boolean; onLogin: (profile: Profile) => void; notice?: string;
}) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = copy[role];
  const path = (target: Role, activation: boolean) =>
    `/${activation ? 'signup' : 'login'}/${target === 'EMPLOYEE' ? 'karyawan' : 'admin'}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = fields.get('email');
    const password = fields.get('password');
    setError('');
    setBusy(true);
    try {
      if (signup) {
        await api('/auth/signup', json('POST', { role, email, password, inviteCode: fields.get('inviteCode') }));
        navigate(path(role, false), { replace: true, state: { notice: 'Akun sudah aktif. Silakan masuk.' } });
      } else {
        onLogin(await api<Profile>('/auth/login', json('POST', { role, email, password })));
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return <main className={`auth-layout ${role === 'HR_ADMIN' ? 'silver' : 'blue'}`}>
    <aside className="auth-hero" aria-label="Ruang Kerja">
      <Brand />
      <div className="hero-body">
        <span className="hero-tag"><i />Portal {current.role}</span>
        <h1>{current.title}</h1>
        <p>{current.text}</p>
        <ol className="hero-steps">
          {current.steps.map((step, index) => <li key={step}>
            <span className="step-number">{index + 1}</span><span>{step}</span>
          </li>)}
        </ol>
      </div>
    </aside>
    <section className="auth-panel" aria-labelledby="auth-heading">
      <div className="auth-content">
        <nav className="role-switch" aria-label="Jenis akun">
          {(['EMPLOYEE', 'HR_ADMIN'] as const).map((item) => <Link
            to={path(item, signup)} aria-current={item === role ? 'page' : undefined} key={item}
          ><span className="role-dot" />{copy[item].role}</Link>)}
        </nav>
        <header className="auth-heading">
          <h2 id="auth-heading">{signup ? 'Aktifkan akun' : 'Selamat datang'}</h2>
          <p>{signup ? 'Gunakan kode undangan untuk membuat kata sandi.' : `Masuk ke portal ${current.role}.`}</p>
        </header>
        <form className="auth-form" onSubmit={submit}>
          <label>Email
            <input name="email" type="email" autoComplete="email" placeholder="nama@perusahaan.co.id" required maxLength={254} />
          </label>
          {signup && <label>Kode undangan
            <input name="inviteCode" autoComplete="off" placeholder="Masukkan kode dari HR" required maxLength={128} />
          </label>}
          <div className="form-field">
            <label htmlFor="auth-password">{signup ? 'Kata sandi baru' : 'Kata sandi'}</label>
            <span className="password-field">
              <input id="auth-password" name="password" type={visible ? 'text' : 'password'} placeholder="Masukkan kata sandi"
                autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 12 : undefined} maxLength={128} required />
              <button type="button" aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setVisible(!visible)}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2 12s3.6-5.5 10-5.5S22 12 22 12s-3.6 5.5-10 5.5S2 12 2 12Z" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.5"/>
                  {visible && <path d="m4 20 16-16" stroke="currentColor" strokeWidth="1.5"/>}
                </svg>
              </button>
            </span>
          </div>
          {signup && <p className="field-note">Gunakan minimal 12 karakter.</p>}
          {error && <p className="error-message" role="alert">{error}</p>}
          {notice && !error && <p className="success-message" role="status">{notice}</p>}
          <button className="primary" disabled={busy}>{busy ? 'Memproses…' : signup ? 'Aktifkan akun' : 'Masuk'}</button>
        </form>
        <p className="mode-link">{signup ? 'Sudah punya akun?' : 'Punya kode undangan?'}{' '}
          <Link to={path(role, !signup)}>{signup ? 'Masuk' : 'Aktifkan akun'}</Link>
        </p>
        <footer className="auth-footer">Portal internal absensi WFH</footer>
      </div>
    </section>
  </main>;
}
