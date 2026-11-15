import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router';
import { ensureCampaign } from '../db';
import { CampaignBar } from '../features/campaigns/CampaignBar';
import { SyncBadge } from '../features/sync/SyncPage';
import { startSync } from '../sync/manager';
import { InstallButton } from './InstallButton';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/bestiary', label: 'Bestiary' },
  { to: '/spells', label: 'Spells' },
  { to: '/encounters', label: 'Encounters' },
  { to: '/combats', label: 'Combats' },
  { to: '/party', label: 'Party' },
  { to: '/sync', label: 'Sync' },
];

export function AppShell() {
  useEffect(startSync, []);
  useEffect(() => void ensureCampaign(), []);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-display text-lg font-bold text-amber-400">
            <img src="./icon.svg" alt="" className="h-7 w-7" />
            <span className="hidden sm:inline">DM Combat Tracker</span>
          </NavLink>
          <nav className="flex gap-1 overflow-x-auto text-sm">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-md px-3 py-1.5 transition-colors ${
                    isActive ? 'bg-amber-500/15 text-amber-300' : 'text-stone-400 hover:bg-stone-800 hover:text-stone-100'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SyncBadge />
            <InstallButton />
          </div>
        </div>
      </header>
      <CampaignBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
