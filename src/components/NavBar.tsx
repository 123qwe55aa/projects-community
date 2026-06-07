'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/map', label: 'Community Map', icon: '🗺️' },
  { href: '/projects', label: 'Projects', icon: '🏛️' },
  { href: '/decisions', label: 'Decisions', icon: '⚖️' },
];

export function NavBar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <nav className="sticky top-0 z-40 flex h-12 items-center gap-1 border-b border-zinc-800 bg-zinc-950/90 px-4 backdrop-blur">
      {/* Logo / Home */}
      <Link
        href="/"
        className="mr-4 flex items-center gap-1.5 text-sm font-semibold text-white hover:text-zinc-300 transition"
      >
        <span className="text-base">🌱</span>
        <span className="hidden sm:inline">Projects Community</span>
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-0.5">
        {navLinks.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={[
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition',
                active
                  ? 'bg-zinc-800 text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900',
              ].join(' ')}
            >
              <span className="text-xs">{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
