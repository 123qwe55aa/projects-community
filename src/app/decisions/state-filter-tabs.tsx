'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'researching', label: 'Researching' },
  { key: 'deferred', label: 'Deferred' },
  { key: 'decided', label: 'Decided' },
  { key: 'archived', label: 'Archived' },
];

export function StateFilterTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentFilter = searchParams.get('state') || 'all';

  const handleFilter = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key === 'all') {
        params.delete('state');
      } else {
        params.set('state', key);
      }
      router.push(`/decisions?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => handleFilter(tab.key)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            currentFilter === tab.key
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}