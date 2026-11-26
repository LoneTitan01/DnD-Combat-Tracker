import { useEffect, useState, type ComponentType, type CSSProperties } from 'react';
import { NavLink, Outlet } from 'react-router';
import { ensureCampaign, removeBundledSpells } from '../db';
import { CampaignBar } from '../features/campaigns/CampaignBar';
import { SyncBadge } from '../features/settings/SyncSettings';
import { startSync } from '../sync/manager';
import {
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ClipboardIcon,
  HomeIcon,
  MapPinIcon,
  MenuIcon,
  PanelCloseIcon,
  PawIcon,
  SparklesIcon,
  SettingsIcon,
  SwordsIcon,
  UserIcon,
  UsersIcon,
} from './icons';
import { InstallButton } from './InstallButton';

const NAV: { to: string; label: string; icon: ComponentType; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/bestiary', label: 'Bestiary', icon: PawIcon },
  { to: '/spells', label: 'Spells', icon: SparklesIcon },
  { to: '/encounters', label: 'Encounters', icon: ClipboardIcon },
  { to: '/combats', label: 'Combats', icon: SwordsIcon },
  { to: '/party', label: 'Party', icon: UsersIcon },
  { to: '/locations', label: 'Locations', icon: MapPinIcon },
  { to: '/npcs', label: 'NPCs', icon: UserIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

/** full: icons and names · preview: icons only · collapsed: hidden, with a button to bring it back. */
type NavMode = 'full' | 'preview' | 'collapsed';
const MODE_KEY = 'nav-mode';
const OPEN_KEY = 'nav-open-mode';

const isWide = () => typeof matchMedia === 'function' && matchMedia('(min-width: 768px)').matches;

function stored(key: string): NavMode | null {
  try {
    const v = localStorage.getItem(key);
    return v === 'full' || v === 'preview' || v === 'collapsed' ? v : null;
  } catch {
    return null;
  }
}

function store(key: string, mode: NavMode) {
  try {
    localStorage.setItem(key, mode);
  } catch {
    // Private windows can refuse storage; the sidebar just won't remember.
  }
}

function useNavMode() {
  const [mode, setModeState] = useState<NavMode>(() => stored(MODE_KEY) ?? (isWide() ? 'full' : 'preview'));
  // The open state to return to after un-collapsing.
  const [openMode, setOpenMode] = useState<'full' | 'preview'>(() =>
    stored(OPEN_KEY) === 'preview' ? 'preview' : 'full',
  );
  const setMode = (m: NavMode) => {
    setModeState(m);
    store(MODE_KEY, m);
    if (m !== 'collapsed') {
      setOpenMode(m);
      store(OPEN_KEY, m);
    }
  };
  return { mode, setMode, reopen: () => setMode(openMode) };
}

const itemClass = (full: boolean, active = false) =>
  `flex items-center gap-3 rounded-md py-2 text-sm transition-colors ${full ? 'px-3' : 'justify-center px-0'} ${
    active ? 'bg-amber-500/15 text-amber-300' : 'text-stone-400 hover:bg-stone-800 hover:text-stone-100'
  }`;

function Sidebar({ mode, setMode }: { mode: 'full' | 'preview'; setMode: (m: NavMode) => void }) {
  const full = mode === 'full';
  // On narrow screens the full sidebar overlays the page, so close it back to icons after navigating.
  const afterNavigate = () => {
    if (full && !isWide()) setMode('preview');
  };
  return (
    <>
      {full && (
        <div className="fixed inset-0 z-20 bg-black/50 md:hidden" aria-hidden="true" onClick={() => setMode('preview')} />
      )}
      <div
        data-testid="sidebar"
        className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-stone-800 bg-stone-950 transition-[width] ${
          full ? 'w-60' : 'w-14'
        }`}
      >
        <NavLink
          to="/"
          onClick={afterNavigate}
          title="DM Combat Tracker"
          className={`flex h-14 shrink-0 items-center gap-2 border-b border-stone-800 font-display text-base font-bold text-amber-400 ${
            full ? 'px-3' : 'justify-center'
          }`}
        >
          <img src="./icon.svg" alt="" className="h-7 w-7 shrink-0" />
          <span className={full ? 'truncate' : 'sr-only'}>DM Combat Tracker</span>
        </NavLink>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={full ? undefined : label}
              onClick={afterNavigate}
              className={({ isActive }) => itemClass(full, isActive)}
            >
              <Icon />
              <span className={full ? 'truncate' : 'sr-only'}>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={`flex shrink-0 gap-1 border-t border-stone-800 p-2 ${full ? 'flex-row' : 'flex-col'}`}>
          <button
            type="button"
            className={`${itemClass(full)} flex-1`}
            title={full ? 'Show icons only' : 'Show names'}
            aria-label={full ? 'Show icons only' : 'Show names'}
            onClick={() => setMode(full ? 'preview' : 'full')}
          >
            {full ? <ChevronsLeftIcon /> : <ChevronsRightIcon />}
            {full && <span>Icons only</span>}
          </button>
          <button
            type="button"
            className={itemClass(false)}
            style={full ? { paddingInline: '0.75rem' } : undefined}
            title="Hide sidebar"
            aria-label="Hide sidebar"
            onClick={() => setMode('collapsed')}
          >
            <PanelCloseIcon />
          </button>
        </div>
      </div>
    </>
  );
}

export function AppShell() {
  useEffect(startSync, []);
  useEffect(() => void ensureCampaign(), []);
  useEffect(() => {
    // Not urgent: wait until the first screen has loaded.
    const clean = () => void removeBundledSpells().catch((e) => console.warn('Could not remove the old default spells:', e));
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(clean, { timeout: 3000 });
      return () => cancelIdleCallback(handle);
    }
    const handle = setTimeout(clean, 1000);
    return () => clearTimeout(handle);
  }, []);
  const { mode, setMode, reopen } = useNavMode();
  const collapsed = mode === 'collapsed';
  return (
    // --nav-width: room the sidebar takes (fixed bars on pages start after it; on narrow screens the full sidebar
    // overlays the page instead). --nav-button-space: room for the "Show sidebar" button while it's hidden.
    <div
      className={`flex min-h-dvh ${
        mode === 'full' ? '[--nav-width:3.5rem] md:[--nav-width:15rem]' : mode === 'preview' ? '[--nav-width:3.5rem]' : '[--nav-width:0px]'
      }`}
      style={{ '--nav-button-space': collapsed ? '3rem' : '0px' } as CSSProperties}
    >
      {/* Reserves the sidebar's width in the layout; the sidebar itself is fixed so it stays put on scroll. */}
      <div aria-hidden="true" className="w-[var(--nav-width)] shrink-0 transition-[width]" />
      {collapsed ? (
        <button
          type="button"
          title="Show sidebar"
          aria-label="Show sidebar"
          onClick={reopen}
          className="fixed left-2 top-2 z-30 rounded-md border border-stone-800 bg-stone-950/95 p-2 text-stone-300 shadow-lg backdrop-blur hover:bg-stone-800 hover:text-amber-300"
        >
          <MenuIcon />
        </button>
      ) : (
        <Sidebar mode={mode} setMode={setMode} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <CampaignBar
          actions={
            <>
              <SyncBadge />
              <InstallButton />
            </>
          }
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
