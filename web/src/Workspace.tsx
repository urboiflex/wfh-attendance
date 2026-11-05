import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage, json } from './client';

type Attendance = { id: number; date: string; submittedAt: string; employee?: Employee };
type Today = { date: string; attendance: Attendance | null };
type Employee = { id: number; displayName: string; employeeCode: string; email: string; active: number; pending: number };
type Page<T> = { items: T[]; hasNext: boolean };

const todayJakarta = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
const dateLabel = (date: string) => new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', dateStyle: 'long',
}).format(new Date(`${date}T00:00:00Z`));
const timeLabel = (instant: string) => new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', timeStyle: 'short',
}).format(new Date(instant)) + ' WIB';

function ErrorText({ value }: { value: string }) {
  return value ? <p className="error-message" role="alert">{value}</p> : null;
}

export function EmployeeWorkspace() {
  const [status, setStatus] = useState<Today>();
  const [photo, setPhoto] = useState<File>();
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try { setStatus(await api<Today>('/attendance/today')); }
    catch (failure) { setError(errorMessage(failure)); }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo || !status) return;
    const previous = status.date;
    setBusy(true);
    setError('');
    const body = new FormData();
    body.set('photo', photo);
    try {
      const attendance = await api<Attendance>('/attendance', { method: 'POST', body });
      setStatus({ date: attendance.date, attendance });
      setPhoto(undefined);
    } catch (failure) {
      let message = errorMessage(failure);
      if (!(failure instanceof ApiError) || [409, 502, 503, 504].includes(failure.status)) {
        try {
          const refreshed = await api<Today>('/attendance/today');
          setStatus(refreshed);
          if (refreshed.date !== previous) message = 'Hari sudah berganti. Hubungi HR untuk memeriksa absensi sebelumnya.';
          else if (refreshed.attendance) message = '';
        } catch { /* Keep the original error if status is still unavailable. */ }
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="workspace-main">
    <h1>Absensi WFH</h1>
    <p className="muted">{status ? dateLabel(status.date) : 'Waktu Jakarta (WIB)'}</p>
    <section className="surface checkin-card">
      <ErrorText value={error} />
      {!status ? error ? <button className="secondary" onClick={load}>Muat ulang</button> : <p role="status">Memeriksa absensi…</p>
        : status.attendance ? <>
          <span className="badge active">Tercatat</span>
          <h2>Absensi sudah tercatat</h2>
          <p>{dateLabel(status.attendance.date)} · {timeLabel(status.attendance.submittedAt)}</p>
          <a className="text-link" href={`/api/attendance/${status.attendance.id}/evidence`} target="_blank" rel="noreferrer">Lihat foto bukti</a>
        </> : <>
          <span className="badge">Belum absen</span>
          <h2>Unggah foto bukti</h2>
          <p className="muted">Pilih foto JPEG atau PNG dengan ukuran maksimal 2 MiB.</p>
          <form className="stack" onSubmit={submit}>
            <label>Foto WFH<input type="file" accept="image/jpeg,image/png" required onChange={(event) => {
              const chosen = event.currentTarget.files?.[0];
              if (chosen && chosen.size > 2 * 1024 * 1024) {
                setError('Ukuran foto maksimal 2 MiB.');
                setPhoto(undefined);
                event.currentTarget.value = '';
              } else { setError(''); setPhoto(chosen); }
            }} /></label>
            {preview && <img className="evidence" src={preview} alt="Pratinjau foto bukti" />}
            <button className="primary" disabled={busy || !photo}>{busy ? 'Mengirim…' : 'Catat absensi'}</button>
          </form>
        </>}
    </section>
  </main>;
}

function PageButtons({ page, hasNext, onChange }: { page: number; hasNext: boolean; onChange: (page: number) => void }) {
  if (page === 1 && !hasNext) return null;
  return <div className="pagination">
    <button className="secondary" disabled={page === 1} onClick={() => onChange(page - 1)}>Sebelumnya</button>
    <span>Halaman {page}</span>
    <button className="secondary" disabled={!hasNext} onClick={() => onChange(page + 1)}>Selanjutnya</button>
  </div>;
}

function EmployeeList() {
  const [page, setPage] = useState(1);
  const [activeOnly, setActiveOnly] = useState(false);
  const [result, setResult] = useState<Page<Employee>>();
  const [edit, setEdit] = useState<Employee | null>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    api<Page<Employee>>(`/employees?page=${page}${activeOnly ? '&active=true' : ''}`, { signal: controller.signal })
      .then(setResult).catch((failure) => { if (!controller.signal.aborted) setError(errorMessage(failure)); });
    return () => controller.abort();
  }, [page, activeOnly, revision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get('email'));
    const body = { displayName: fields.get('displayName'), email };
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (edit) {
        const initialPassword = fields.get('password');
        await api(`/employees/${edit.id}`, json('PATCH', initialPassword ? { ...body, initialPassword } : body));
        setNotice('Data karyawan diperbarui.');
      } else {
        await api('/employees', json('POST', { ...body, employeeCode: fields.get('employeeCode'), password: fields.get('password') }));
        setNotice('Akun karyawan dibuat. Sampaikan kata sandi awal secara langsung kepada karyawan.');
        setPage(1);
      }
      setEdit(undefined);
      setRevision((value) => value + 1);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  async function deactivate(employee: Employee) {
    if (!confirm(`Nonaktifkan akun ${employee.displayName}?`)) return;
    setError('');
    setNotice('');
    try {
      await api(`/employees/${employee.id}`, { method: 'DELETE' });
      setRevision((value) => value + 1);
    } catch (failure) { setError(errorMessage(failure)); }
  }

  return <section className="surface">
    <div className="section-bar"><h2>Data karyawan</h2><button className="primary" onClick={() => { setEdit(null); setNotice(''); setError(''); }}>Tambah karyawan</button></div>
    <ErrorText value={error} />
    {notice && <p className="success-message" role="status">{notice}</p>}
    {edit !== undefined && <form className="employee-form" onSubmit={save} key={edit?.id ?? 'new'}>
      {!edit && <label>Kode karyawan<input name="employeeCode" required maxLength={24} /></label>}
      <label>Nama lengkap<input name="displayName" required defaultValue={edit?.displayName} maxLength={100} /></label>
      <label>Email<input name="email" type="email" required defaultValue={edit?.email} maxLength={254} /></label>
      {(!edit || (!!edit.pending && !!edit.active)) && <label>Kata sandi awal
        <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128}
          placeholder="Minimal 12 karakter" required />
      </label>}
      <div className="actions"><button className="primary" disabled={busy}>Simpan</button>
        <button type="button" className="secondary" onClick={() => setEdit(undefined)}>Batal</button></div>
    </form>}
    <label className="filter-check"><input type="checkbox" checked={activeOnly} onChange={(event) => { setPage(1); setError(''); setActiveOnly(event.currentTarget.checked); }} /> Hanya akun aktif</label>
    {!result ? !error && <p role="status">Memuat data…</p> : result.items.length === 0 ? <p>Belum ada karyawan di halaman ini.</p> :
      <div className="table-scroll"><table><thead><tr><th>Karyawan</th><th>Email</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>{result.items.map((employee) => <tr key={employee.id}>
          <td><strong>{employee.displayName}</strong><br /><small>{employee.employeeCode}</small></td><td>{employee.email}</td>
          <td><span className={`badge ${employee.active && !employee.pending ? 'active' : ''}`}>
            {!employee.active ? 'Nonaktif' : employee.pending ? 'Perlu kata sandi awal' : 'Aktif'}</span></td>
          <td className="actions"><button className="secondary" onClick={() => { setEdit(employee); setNotice(''); setError(''); }}>Edit</button>
            {!!employee.active && <button className="secondary" onClick={() => deactivate(employee)}>Nonaktifkan</button>}</td>
        </tr>)}</tbody></table></div>}
    {result && <PageButtons page={page} hasNext={result.hasNext} onChange={setPage} />}
  </section>;
}

function Monitoring() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(() => ({ from: todayJakarta(), to: todayJakarta(), employeeId: '' }));
  const [result, setResult] = useState<Page<Attendance>>();
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<number>();

  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError('');
    setPhoto(undefined);
    const params = new URLSearchParams({ from: filters.from, to: filters.to, page: String(page) });
    if (filters.employeeId) params.set('employeeId', filters.employeeId);
    api<Page<Attendance>>(`/attendance?${params}`, { signal: controller.signal })
      .then(setResult).catch((failure) => { if (!controller.signal.aborted) setError(errorMessage(failure)); });
    return () => controller.abort();
  }, [filters, page]);

  return <section className="surface">
    <h2>Pantau absensi</h2>
    <form className="employee-form" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      setPage(1);
      setFilters({ from: String(data.get('from')), to: String(data.get('to')), employeeId: String(data.get('employeeId')) });
    }}>
      <label>Dari tanggal<input name="from" type="date" required defaultValue={filters.from} /></label>
      <label>Sampai tanggal<input name="to" type="date" required defaultValue={filters.to} /></label>
      <label>ID karyawan<input name="employeeId" type="number" min="1" placeholder="Semua karyawan" /></label>
      <button className="primary">Terapkan</button>
    </form>
    <ErrorText value={error} />
    {!result ? !error && <p role="status">Memuat absensi…</p> : result.items.length === 0 ? <p>Belum ada absensi untuk filter ini.</p> :
      <div className="table-scroll"><table><thead><tr><th>Karyawan</th><th>Tanggal</th><th>Waktu</th><th>Bukti</th></tr></thead>
        <tbody>{result.items.map((row) => <tr key={row.id}>
          <td><strong>{row.employee?.displayName ?? 'Karyawan'}</strong><br /><small>{row.employee?.employeeCode} · ID {row.employee?.id}</small></td>
          <td>{dateLabel(row.date)}</td><td>{timeLabel(row.submittedAt)}</td>
          <td><button className="secondary" onClick={() => setPhoto(row.id)} aria-expanded={photo === row.id}>Lihat foto</button></td>
        </tr>)}</tbody></table></div>}
    {result && <PageButtons page={page} hasNext={result.hasNext} onChange={setPage} />}
    {photo && <figure className="evidence-preview"><img className="evidence" src={`/api/attendance/${photo}/evidence`} alt="Foto bukti absensi" />
      <figcaption><button className="secondary" onClick={() => setPhoto(undefined)}>Tutup foto</button></figcaption></figure>}
  </section>;
}

export function HrWorkspace() {
  const [monitor, setMonitor] = useState(false);
  return <main className="workspace-main">
    <h1>Portal Admin HR</h1>
    <nav className="workspace-tabs" aria-label="Menu Admin HR">
      <button className="secondary" aria-pressed={!monitor} onClick={() => setMonitor(false)}>Karyawan</button>
      <button className="secondary" aria-pressed={monitor} onClick={() => setMonitor(true)}>Absensi</button>
    </nav>
    {monitor ? <Monitoring /> : <EmployeeList />}
  </main>;
}
