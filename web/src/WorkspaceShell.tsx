import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useAnimate, useIsPresent, useReducedMotion } from 'motion/react';
import { NavLink, useLocation, useOutlet, useOutletContext } from 'react-router-dom';
import type { Profile } from './client';
import './workspace.css';

const icons = {
  people: <><circle cx="8" cy="6" r="2.75" /><path d="M2.75 16.25V15a3.75 3.75 0 0 1 3.75-3.75h3A3.75 3.75 0 0 1 13.25 15v1.25M13 3.5a2.75 2.75 0 0 1 0 5.4m2 2.5a3.75 3.75 0 0 1 2.25 3.45v1.4" /></>,
  calendar: <><rect x="3.25" y="4.75" width="13.5" height="12" rx="2" /><path d="M6.75 3v3.5m6.5-3.5v3.5M3.25 8.75h13.5M7.5 12.5l1.75 1.75 3.25-3.5" /></>,
  shield: <><path d="M10 2.75 4 5v4.25c0 3.6 2.45 6.15 6 8 3.55-1.85 6-4.4 6-8V5l-6-2.25Z" /><path d="M10 7v5.5M7.25 9.75h5.5" /></>,
  settings: <><path d="m8.2 3-.6 1.8-1.5.85-1.85-.4-1.6 2.8 1.25 1.4v1.7l-1.25 1.4 1.6 2.8 1.85-.4 1.5.85.6 1.8h3.6l.6-1.8 1.5-.85 1.85.4 1.6-2.8-1.25-1.4v-1.7l1.25-1.4-1.6-2.8-1.85.4-1.5-.85-.6-1.8Z" /><circle cx="10" cy="10.3" r="2.25" /></>,
  menu: <path d="M3 5h14M3 10h14M3 15h14" />,
  panel: <><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12" /></>,
  search: <><circle cx="8.75" cy="8.75" r="4.5" /><path d="m12 12 3.5 3.5" /></>,
  close: <path d="m5 5 10 10M15 5 5 15" />,
  logout: <path d="M8 4H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 16h3m4.5-9.5L16 10l-3.5 3.5M7 10h9" />,
  sun: <><circle cx="10" cy="10" r="3" /><path d="M10 2.5v1.75m0 11.5v1.75M2.5 10h1.75m11.5 0h1.75M4.7 4.7l1.25 1.25m8.1 8.1 1.25 1.25m0-10.6-1.25 1.25m-8.1 8.1L4.7 15.3" /></>,
  moon: <path d="M16.75 12.3A7.2 7.2 0 0 1 7.7 3.25a7.05 7.05 0 1 0 9.05 9.05Z" />,
  upload: <><path d="M10 13V3m-3.5 3.5L10 3l3.5 3.5M4 12.5V15a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2.5" /></>,
  check: <path d="m4.5 10 3.75 3.75 7.25-7.25" />,
};

export function Icon({ name }: { name: keyof typeof icons }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
    strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
}

type Destination = { to: string; label: string; icon: keyof typeof icons };
const hrNavigation: Destination[] = [
  { to: '/admin', label: 'Karyawan', icon: 'people' },
  { to: '/admin/attendance', label: 'Absensi', icon: 'calendar' },
  { to: '/admin/accounts/new', label: 'Akun Admin', icon: 'shield' },
];
const employeeNavigation: Destination[] = [{ to: '/karyawan', label: 'Absensi WFH', icon: 'calendar' }];

function Sidebar({ role, items, settings, control, onNavigate, collapsed = false }: {
  role: string; items: Destination[]; settings: Destination; control: ReactNode; onNavigate?: () => void; collapsed?: boolean;
}) {
  const [query, setQuery] = useState('');
  const filter = collapsed ? '' : query.trim().toLowerCase();
  const filtered = [...items, settings].filter(({ label }) => label.toLowerCase().includes(filter));

  function link({ to, label, icon }: Destination) {
    return <NavLink key={to} to={to} end onClick={() => { setQuery(''); onNavigate?.(); }} aria-label={label} title={label}>
      <Icon name={icon} /><span className="nav-label">{label}</span>
    </NavLink>;
  }

  return <>
    <div className="shell-identity">
      <span className="shell-mark" aria-hidden="true">rk</span>
      <div className="shell-identity-text"><strong>Ruang Kerja</strong><small>{role}</small></div>
      {control}
    </div>
    <div className="shell-nav-content">
      <label className="shell-search"><Icon name="search" />
        <input type="search" placeholder="Cari menu" aria-label="Cari menu" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <nav className="shell-nav" aria-label={`Menu ${role}`}>
        <span className="nav-caption">Menu utama</span>
        {filtered.filter((item) => item !== settings).map(link)}
        {filter && filtered.includes(settings) && link(settings)}
        {filtered.length === 0 && <p className="nav-empty">Menu tidak ditemukan.</p>}
      </nav>
    </div>
    {!filter && <nav className="shell-nav shell-settings" aria-label="Preferensi">{link(settings)}</nav>}
  </>;
}

type Theme = 'light' | 'dark';
type Appearance = { theme: Theme; changeTheme: (theme: Theme) => void };

function WorkspacePage({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const reducedMotion = useReducedMotion();
  return <motion.div inert={!present}
    initial={reducedMotion ? false : { opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0, transition: { duration: reducedMotion ? 0 : .18, ease: 'easeOut' } }}
    exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : .11, ease: 'easeIn' } }}>
    {children}
  </motion.div>;
}

export function WorkspaceShell({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const isAdmin = profile.role === 'HR_ADMIN';
  const role = isAdmin ? 'Admin HR' : 'Karyawan';
  const items = isAdmin ? hrNavigation : employeeNavigation;
  const settings: Destination = { to: isAdmin ? '/admin/settings' : '/karyawan/settings', label: 'Pengaturan', icon: 'settings' };
  const location = useLocation();
  const active = [...items, settings].find((item) => item.to === location.pathname) ?? items[0];
  const themeKey = `wfh-theme:${profile.id}`;
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem(themeKey) === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, animateDrawer] = useAnimate<HTMLDialogElement>();
  const closingDrawer = useRef(false);
  const reducedMotion = useReducedMotion();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 761px)');
    function closeDrawer(event: MediaQueryListEvent) {
      if (event.matches) drawer.current?.close();
    }
    desktop.addEventListener('change', closeDrawer);
    return () => desktop.removeEventListener('change', closeDrawer);
  }, [drawer]);

  function openDrawer() {
    const dialog = drawer.current;
    if (!dialog || dialog.open || closingDrawer.current) return;
    dialog.showModal();
    setDrawerOpen(true);
    void animateDrawer(dialog, {
      x: reducedMotion ? '0%' : ['-100%', '0%'],
      opacity: reducedMotion ? 1 : [0, 1],
      '--drawer-scrim': reducedMotion ? .57 : [0, .57],
    }, { duration: reducedMotion ? 0 : .22, ease: 'easeOut' });
  }

  async function closeDrawer() {
    const dialog = drawer.current;
    if (!dialog?.open || closingDrawer.current) return;
    if (reducedMotion) { dialog.close(); return; }
    closingDrawer.current = true;
    try {
      await animateDrawer(dialog, { x: '-100%', opacity: 0, '--drawer-scrim': 0 }, { duration: .18, ease: 'easeIn' });
    } finally {
      dialog.close();
      closingDrawer.current = false;
    }
  }

  function changeTheme(next: Theme) {
    setTheme(next);
    try { localStorage.setItem(themeKey, next); } catch { /* Keep the selection for this session. */ }
  }

  const outlet = useOutlet({ theme, changeTheme } satisfies Appearance);
  const initials = profile.displayName.trim().split(/\s+/).slice(0, 2).map((name) => name[0]).join('').toUpperCase();
  return <div className={`workspace ${isAdmin ? 'silver' : 'blue'}${collapsed ? ' shell-collapsed' : ''}`} data-theme={theme}>
    <aside id="desktop-workspace-menu" className="shell-sidebar">
      <Sidebar collapsed={collapsed} role={role} items={items} settings={settings} control={<button type="button" className="shell-icon-button sidebar-toggle"
        aria-label={collapsed ? 'Luaskan menu' : 'Ringkas menu'} aria-expanded={!collapsed} aria-controls="desktop-workspace-menu"
        onClick={() => setCollapsed(!collapsed)}><Icon name={isAdmin ? 'panel' : 'menu'} /></button>} />
    </aside>
    <div className="shell-content">
      <header className="shell-topbar">
        <div className="shell-location">
          <button type="button" className="shell-icon-button shell-hamburger" aria-label="Buka menu" aria-expanded={drawerOpen}
            aria-controls="mobile-workspace-menu" onClick={openDrawer}>
            <Icon name="menu" />
          </button>
          <span className="shell-breadcrumb"><Icon name={active.icon} />{active.label}</span>
        </div>
        <div className="shell-user">
          <span className="shell-avatar" aria-hidden="true">{initials}</span>
          <span className="shell-user-name">{profile.displayName}</span>
          <button type="button" className="shell-icon-button" aria-label="Keluar" title="Keluar" onClick={onSignOut}><Icon name="logout" /></button>
        </div>
      </header>
      <AnimatePresence initial={false} mode="wait">
        <WorkspacePage key={location.pathname}>{outlet}</WorkspacePage>
      </AnimatePresence>
    </div>
    <dialog id="mobile-workspace-menu" ref={drawer} className="shell-drawer" aria-label={`Menu ${role}`}
      onClose={() => setDrawerOpen(false)}
      onCancel={(event) => { event.preventDefault(); void closeDrawer(); }}
      onClick={(event) => { if (event.target === event.currentTarget) void closeDrawer(); }}>
      <div className="shell-drawer-inner">
        <Sidebar role={role} items={items} settings={settings} onNavigate={() => void closeDrawer()}
          control={<button type="button" className="shell-icon-button" aria-label="Tutup menu" onClick={() => void closeDrawer()}><Icon name="close" /></button>} />
      </div>
    </dialog>
  </div>;
}

export function WorkspaceSettings() {
  const { theme, changeTheme } = useOutletContext<Appearance>();
  return <main className="workspace-main">
    <header className="workspace-heading"><h1>Pengaturan</h1><p>Sesuaikan tampilan ruang kerja Anda.</p></header>
    <section className="surface appearance-card" aria-labelledby="appearance-title">
      <div><h2 id="appearance-title">Tampilan</h2><p className="muted">Pilihan disimpan untuk akun ini di browser ini.</p></div>
      <fieldset className="theme-options">
        <legend>Tema warna</legend>
        {(['light', 'dark'] as const).map((option) => <label key={option} className="theme-choice">
          <input type="radio" name="theme" value={option} checked={theme === option} onChange={() => changeTheme(option)} />
          <span className={`theme-swatch theme-swatch-${option}`} aria-hidden="true"><i /><i /><i /></span>
          <span className="theme-choice-label"><Icon name={option === 'light' ? 'sun' : 'moon'} />{option === 'light' ? 'Terang' : 'Gelap'}</span>
        </label>)}
      </fieldset>
    </section>
  </main>;
}
