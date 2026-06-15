'use client';

import { useState } from 'react';

export function DeleteProjectButton({ projectId, onDeleted }: { projectId: string; onDeleted?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (res.ok) {
        onDeleted?.();
      }
    } catch (e) {
      console.error('Delete failed', e);
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirming(true);
        }}
        className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition p-1"
        title="Delete project"
      >
        ✕
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}>
      <span className="text-xs text-red-400">Delete?</span>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDelete();
        }}
        disabled={loading}
        className="text-xs px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
      >
        {loading ? '...' : 'Yes'}
      </button>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirming(false);
        }}
        className="text-xs text-zinc-500 hover:text-zinc-300"
      >
        No
      </button>
    </div>
  );
}
