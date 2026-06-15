'use client';

import { useState, useEffect } from 'react';
import { getObsidianProjectsAction, batchImportObsidianProjectsAction } from '@/app/actions';

interface ObsidianProject {
  key: string;
  summary: string;
  background: string;
  buildingStyle: string;
  imageUrl: string | null;
  deployUrl: string | null;
}

export function ObsidianImportFlow({
  onDone,
  onBack,
}: {
  onDone: () => void;
  onBack: () => void;
}) {
  const [projects, setProjects] = useState<ObsidianProject[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<number | null>(null);

  useEffect(() => {
    getObsidianProjectsAction()
      .then((data) => {
        setProjects(data.projects);
        setSelected(new Set(data.projects.map((p: ObsidianProject) => p.key)));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleImport() {
    if (selected.size === 0) return;
    setImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('keys', JSON.stringify([...selected]));
      const res = await batchImportObsidianProjectsAction(formData);
      setResult(res.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  if (result !== null) {
    return (
      <div className="p-6 space-y-4 text-center">
        <div className="text-4xl">✅</div>
        <h2 className="text-lg font-semibold text-white">Import Complete</h2>
        <p className="text-sm text-zinc-400">
          {result} project{result !== 1 ? 's' : ''} imported successfully.
        </p>
        <button
          onClick={onDone}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="text-zinc-500 hover:text-white text-sm"
          aria-label="Back"
        >
          ←
        </button>
        <h2 className="text-lg font-semibold text-white">Import from Obsidian</h2>
      </div>

      {loading && (
        <div className="py-8 text-center text-sm text-zinc-500">Loading projects...</div>
      )}

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-500">No Obsidian projects found.</p>
          <p className="text-xs text-zinc-600 mt-1">
            Add projects to templates/obsidian-projects.yaml and try again.
          </p>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {projects.map((p) => (
              <label
                key={p.key}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                  selected.has(p.key)
                    ? 'border-purple-700 bg-purple-950/20'
                    : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.key)}
                  onChange={() => toggle(p.key)}
                  className="mt-0.5 accent-purple-500"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{p.summary}</p>
                  <p className="text-xs text-zinc-500 line-clamp-1">{p.background}</p>
                  <span className="text-[11px] text-zinc-600 capitalize">{p.buildingStyle}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
            <p className="text-xs text-zinc-500">
              {selected.size} of {projects.length} selected
            </p>
            <div className="flex gap-3">
              <button
                onClick={onBack}
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={selected.size === 0 || importing}
                className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {importing ? 'Importing...' : `Import ${selected.size} project${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
