import { CalendarCheck, CloudOff, History, Settings, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Route } from '../app/router';
import { cn } from './parts/base';

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Persistent while offline. No toast spam (AC-F10-3). */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-start justify-center gap-3 bg-warning-soft px-5 py-3 text-body text-warning"
    >
      <CloudOff aria-hidden className="mt-0.5 size-6 shrink-0" />
      <p>You&rsquo;re offline. Calls you&rsquo;ve downloaded still work.</p>
    </div>
  );
}

interface NavItem {
  name: Route['name'][];
  href: string;
  label: string;
  Icon: LucideIcon;
}

const TABS: NavItem[] = [
  { name: ['today', 'result', 'replay'], href: '#/today', label: 'Today', Icon: CalendarCheck },
  { name: ['calls', 'replay-attempt'], href: '#/calls', label: 'My calls', Icon: History },
  { name: ['settings'], href: '#/settings', label: 'Settings', Icon: Settings },
];
const FAMILY: NavItem = {
  name: ['coach', 'coach-call', 'inbox'],
  href: '#/coach',
  label: 'For family',
  Icon: Users,
};

export function Wordmark({ className }: { className?: string }) {
  return (
    <a
      href="#/today"
      className={cn(
        '-ml-2 inline-flex h-14 items-center rounded-md px-2 text-title whitespace-nowrap text-text',
        className,
      )}
    >
      Hang Up Club
    </a>
  );
}

/** Wide screens: a 64px top bar with the same three items and "For family". */
export function TopBar({ route }: { route: Route }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = (): void => {
      setScrolled(window.scrollY > 4);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  return (
    <header
      className={cn(
        'sticky top-0 z-10 hidden h-16 items-center bg-bg md:flex',
        scrolled ? 'shadow-e2' : 'shadow-none',
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-8 xl:px-10">
        <Wordmark />
        <nav aria-label="Main" className="flex items-center gap-1">
          {[...TABS, FAMILY].map(({ name, href, label, Icon }) => {
            const active = name.includes(route.name);
            return (
              <a
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-14 items-center gap-2 rounded-md px-3 text-ui whitespace-nowrap hover:bg-surface-2 lg:px-4',
                  active ? 'text-text' : 'text-text-muted',
                )}
              >
                <Icon aria-hidden className="size-5" />
                {label}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

/** Phones: a bottom tab bar, 72px plus the safe area. Tab switches are instant. */
export function TabBar({ route }: { route: Route }) {
  return (
    <nav
      aria-label="Main"
      className="huc-safe-bottom fixed inset-x-0 bottom-0 z-10 bg-surface shadow-[0_-1px_0_var(--border)] md:hidden"
    >
      <ul className="mx-auto flex h-18 max-w-160">
        {TABS.map(({ name, href, label, Icon }) => {
          const active = name.includes(route.name);
          return (
            <li key={href} className="relative flex-1">
              {active && <span aria-hidden className="absolute inset-x-5 top-0 h-0.75 bg-accent" />}
              <a
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-0.5 text-meta',
                  active ? 'text-text' : 'text-text-muted',
                )}
              >
                <Icon aria-hidden className="size-6" />
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Content column: 640px, centred, 20/32/40px gutters. */
export function Page({
  children,
  wide = false,
  className,
  withTabBar = true,
}: {
  children: ReactNode;
  wide?: boolean;
  className?: string;
  withTabBar?: boolean;
}) {
  return (
    <main
      className={cn(
        'mx-auto flex w-full flex-col gap-8 px-5 pt-6 md:px-8 md:pt-8 xl:px-10',
        wide ? 'max-w-5xl' : 'max-w-160',
        withTabBar ? 'pb-32 md:pb-16' : 'pb-16',
        className,
      )}
    >
      {children}
    </main>
  );
}
