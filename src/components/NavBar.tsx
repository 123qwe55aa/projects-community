'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const primaryLinks = [
  { href: '/', label: 'Dashboard', icon: '◉' },
  { href: '/attention', label: 'Needs Attention', icon: '!' },
  { href: '/hypotheses', label: 'Hypotheses', icon: '◇' },
  { href: '/projects', label: 'Projects', icon: '▦' },
];

const secondaryLinks = [
  { href: '/decisions', label: 'Decisions' },
  { href: '/map', label: 'Community Map' },
];

export function NavBar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-40 flex min-h-12 items-center gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-950/90 px-4 backdrop-blur"
    >
      <Link
        href="/"
        aria-label="Projects Community home"
        className="mr-3 flex shrink-0 items-center gap-1.5 text-sm font-semibold text-white transition hover:text-zinc-300"
      >
        <span className="text-base" aria-hidden="true">🌱</span>
        <span className="hidden sm:inline">Projects Community</span>
      </Link>

      <div className="flex shrink-0 items-center gap-0.5">
        {primaryLinks.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition',
                active
                  ? 'bg-zinc-800 text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900',
              ].join(' ')}
            >
              <span className="text-xs" aria-hidden="true">{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="mx-2 h-5 w-px shrink-0 bg-zinc-800" aria-hidden="true" />

      <div className="flex shrink-0 items-center gap-0.5">
        {secondaryLinks.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'rounded-md px-2.5 py-1.5 text-xs transition',
                active
                  ? 'bg-zinc-800 text-white font-medium'
                  : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300',
              ].join(' ')}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
