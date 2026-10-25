import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight, BarChart3, Bell, CalendarCheck, CalendarDays, ChevronDown, Command, LayoutDashboard,
  LogOut, Megaphone, Menu, ScrollText, Search, Settings2, ShieldCheck, Sparkles, UserRound, Users, Wallet, X,
} from 'lucide-react';
import { Avatar, Badge, Button, Card, Spinner, cn } from './ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { get, patch } from '../lib/api';
import { relativeTime, titleCase } from '../lib/format';

const NAV = [
  {
    section: 'Workspace',
    items: [
      { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/app/attendance', label: 'Attendance', icon: CalendarCheck },
      { to: '/app/leave', label: 'Leave', icon: CalendarDays },
      { to: '/app/payroll', label: 'Payroll', icon: Wallet },
      { to: '/app/announcements', label: 'Announcements', icon: Megaphone },
    ],
  },
  {
    section: 'People',
    roles: ['admin', 'hr'],
    items: [
      { to: '/app/employees', label: 'Employees', icon: Users },
      { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    section: 'Administration',
    roles: ['admin'],
    items: [
      { to: '/app/users', label: 'Logins & access', icon: ShieldCheck },
      { to: '/app/settings', label: 'Settings', icon: Settings2 },
      { to: '/app/audit', label: 'Audit log', icon: ScrollText },
    ],
  },
];

const ROLE_TONE = { admin: 'rose', hr: 'cyan', employee: 'violet' };

function useClickOutside(onClose) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [onClose]);
  return ref;
}

function Brand() {
  return (
    <Link to="/app" className="flex items-center gap-2.5 px-1">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-display text-sm font-bold text-ink-950">H</span>
      <span className="font-display text-[15px] font-semibold tracking-tight text-text">HCM Lite</span>
    </Link>
  );
}

function SidebarContent({ onNavigate }) {
  const { user } = useAuth();
  const sections = NAV.filter((s) => !s.roles || s.roles.includes(user?.role));

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-5">
        <Brand />
      </div>

      <nav aria-label="Primary" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.section}>
            <p className="label-mono mb-2 px-2">{section.section}</p>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-[13.5px] transition-colors',
                        isActive ? 'nav-active' : 'text-text-muted hover:bg-white/[0.05] hover:text-text',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon size={16} className={isActive ? 'text-cyan-soft' : 'text-text-faint group-hover:text-text-muted'} aria-hidden="true" />
                        <span className="flex-1">{item.label}</span>
                        {isActive ? <span className="h-1 w-1 rounded-full bg-cyan" aria-hidden="true" /> : null}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-3">
        <Link
          to="/app/assistant"
          onClick={onNavigate}
          className="group relative block overflow-hidden rounded-xl border border-violet/25 bg-gradient-to-br from-violet/20 to-cyan/10 p-3"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-cyan-soft" aria-hidden="true" />
            <p className="text-[12.5px] font-medium text-text">Ask the assistant</p>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-text-muted">Answers from your own records.</p>
          <ArrowUpRight size={13} className="absolute right-2.5 top-2.5 text-text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="border-t border-white/[0.06] px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-xl px-1.5 py-1">
          <Avatar name={user?.name} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-text">{user?.name}</p>
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">{user?.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const [loading, setLoading] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const { setUnread } = useAuth();

  const load = async () => {
    setLoading(true);
    try {
      const res = await get('/notifications');
      setData(res);
      setUnread(res.unread);
    } catch {
      /* silent: the bell is not critical */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAll = async () => {
    await patch('/notifications/read-all');
    setData((d) => ({ ...d, unread: 0, items: d.items.map((i) => ({ ...i, read: true })) }));
    setUnread(0);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`}
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-xl text-text-muted transition hover:bg-white/[0.06] hover:text-text"
      >
        <Bell size={17} />
        {data.unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose px-1 text-[9.5px] font-semibold text-white">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-11 z-50 w-[320px] overflow-hidden rounded-xl glass-strong shadow-card"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-2.5">
              <p className="text-[12.5px] font-medium text-text">Notifications</p>
              {data.unread ? (
                <button type="button" onClick={markAll} className="text-[11.5px] text-violet-soft hover:underline">
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {loading && !data.items.length ? (
                <div className="grid place-items-center py-8"><Spinner size={16} /></div>
              ) : data.items.length ? (
                data.items.slice(0, 8).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={async () => {
                      await patch(`/notifications/${n.id}/read`);
                      setData((d) => ({ ...d, unread: Math.max(0, d.unread - 1), items: d.items.map((i) => (i.id === n.id ? { ...i, read: true } : i)) }));
                      setUnread(Math.max(0, data.unread - 1));
                    }}
                    className="flex w-full items-start gap-2.5 border-b border-white/[0.04] px-3.5 py-2.5 text-left transition hover:bg-white/[0.03]"
                  >
                    <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.read ? 'bg-white/15' : 'bg-cyan')} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-text">{n.title}</span>
                      <span className="mt-0.5 block line-clamp-2 text-[11.5px] leading-snug text-text-muted">{n.body}</span>
                      <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-text-faint">{relativeTime(n.createdAt)}</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-4 py-8 text-center text-[12.5px] text-text-faint">You are all caught up.</p>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function UserMenu({ onSignOut }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-1.5 rounded-xl p-1 transition hover:bg-white/[0.06]"
      >
        <Avatar name={user?.name} size={30} />
        <ChevronDown size={13} className="text-text-faint" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-xl glass-strong p-1 shadow-card"
          >
            <div className="border-b border-white/[0.07] px-3 py-2.5">
              <p className="truncate text-[13px] font-medium text-text">{user?.name}</p>
              <p className="truncate text-[11.5px] text-text-faint">{user?.email}</p>
              <div className="mt-1.5"><Badge tone={ROLE_TONE[user?.role] || 'neutral'}>{titleCase(user?.role)}</Badge></div>
            </div>
            <Link to="/app/profile" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-text-muted transition hover:bg-white/[0.05] hover:text-text">
              <UserRound size={14} aria-hidden="true" /> My profile
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={onSignOut}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-rose transition hover:bg-rose/10"
            >
              <LogOut size={14} aria-hidden="true" /> Sign out
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const items = useMemo(() => {
    const all = NAV.filter((s) => !s.roles || s.roles.includes(user?.role)).flatMap((s) => s.items);
    all.push({ to: '/app/assistant', label: 'AI assistant', icon: Sparkles }, { to: '/app/profile', label: 'My profile', icon: UserRound });
    return all.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()));
  }, [query, user]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl glass-strong shadow-card"
            role="dialog"
            aria-modal="true"
            aria-label="Quick navigation"
          >
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-3.5 py-3">
              <Search size={15} className="text-text-faint" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && items[0]) {
                    navigate(items[0].to);
                    onClose();
                  }
                  if (e.key === 'Escape') onClose();
                }}
                placeholder="Jump to a screen…"
                aria-label="Search screens"
                className="w-full bg-transparent text-[13.5px] text-text placeholder:text-text-faint focus:outline-none"
              />
              <kbd className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-text-faint">esc</kbd>
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5">
              {items.length ? (
                items.map((item) => (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => {
                      navigate(item.to);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-text-muted transition hover:bg-white/[0.06] hover:text-text"
                  >
                    <item.icon size={15} className="text-text-faint" aria-hidden="true" />
                    {item.label}
                  </button>
                ))
              ) : (
                <p className="px-3 py-6 text-center text-[12.5px] text-text-faint">No screen matches “{query}”.</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default function AppShell() {
  const { user, logout, settings } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    await logout();
    toast.info('Signed out', 'See you soon.');
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-ink-950">
      {/* ambient background */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(124,92,255,0.10),transparent_70%)]" />
        <div className="absolute inset-0 grid-bg opacity-30" />
      </div>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-white/[0.07] bg-ink-900/70 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div className="fixed inset-0 z-[70] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden="true" />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
              className="relative h-full w-[264px] border-r border-white/10 bg-ink-900"
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-white/5"
              >
                <X size={16} />
              </button>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="relative z-10 lg:pl-[248px]">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/75 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="grid h-9 w-9 place-items-center rounded-xl text-text-muted transition hover:bg-white/[0.06] lg:hidden"
            >
              <Menu size={18} />
            </button>

            <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="group flex h-9 w-full max-w-xs items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-left text-[12.5px] text-text-faint transition hover:border-white/15 hover:text-text-muted"
              >
                <Search size={14} aria-hidden="true" />
                <span className="flex-1">Search screens…</span>
                <kbd className="flex items-center gap-0.5 rounded border border-white/10 px-1 py-0.5 font-mono text-[9.5px]">
                  <Command size={9} />K
                </kbd>
              </button>
            </div>

            <div className="flex flex-1 items-center justify-end gap-1.5 sm:flex-none">
              <Button as={Link} to="/app/assistant" variant="secondary" size="sm" icon={Sparkles} className="hidden sm:inline-flex">
                Ask AI
              </Button>
              <NotificationBell />
              <div className="mx-1 h-5 w-px bg-white/10" aria-hidden="true" />
              <UserMenu onSignOut={signOut} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>

        <footer className="border-t border-white/[0.06] px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-2 text-[11px] text-text-faint sm:flex-row">
            <p>{settings?.companyName || 'HCM Lite'} · HCM Lite demo build</p>
            <p className="font-mono uppercase tracking-[0.14em]">
              {user?.role} workspace · server-verified scope
            </p>
          </div>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {signingOut ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-ink-950/80"><Spinner size={22} /></div>
      ) : null}
    </div>
  );
}
