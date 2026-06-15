'use client';

import { useState } from 'react';
import { fetchGitHubRepoAction, createProjectAction } from '@/app/actions';

interface RepoPreview {
  summary: string;
  background: string;
  buildingStyle: string;
  imageUrl: string | null;
  deployUrl: string;
}

const STYLE_LABELS: Record<string, string> = {
  workshop: '🔨 Workshop',
  'data-center': '📊 Data Center',
  studio: '🎨 Studio',
  'community-hall': '🏛️ Community Hall',
};

export function ImportGithubModal({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RepoPreview | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleFetch() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const formData = new FormData();
      formData.set('url', url.trim());
      const data = await fetchGitHubRepoAction(formData);
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch repo');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!preview) return;
    setCreating(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('background', preview.background);
      formData.set('buildingStyle', preview.buildingStyle);
      if (preview.imageUrl) formData.set('imageUrl', preview.imageUrl);
      formData.set('deployUrl', preview.deployUrl);
      await createProjectAction(formData);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900">
        <div className="p-6 space-y-5">
          {/* Header */}
          <div>
            <h2 className="text-lg font-semibold text-white">Import from GitHub</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Enter a GitHub repo URL to auto-create a project from its README and metadata.
            </p>
          </div>

          {/* URL input */}
          <div className="flex gap-2">
            <input
              id="github-repo-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
              placeholder="https://github.com/owner/repo"
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-white focus:outline-none"
            />
            <button
              onClick={handleFetch}
              disabled={loading || !url.trim()}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 transition disabled:opacity-50"
            >
              {loading ? 'Fetching…' : 'Fetch'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white truncate">{preview.summary}</p>
                <span className="ml-2 shrink-0 text-xs text-zinc-500">
                  {STYLE_LABELS[preview.buildingStyle] ?? preview.buildingStyle}
                </span>
              </div>
              <p className="text-xs text-zinc-400 line-clamp-4 whitespace-pre-line">
                {preview.background}
              </p>
              {preview.deployUrl && (
                <p className="text-xs text-zinc-600 truncate">
                  🔗 {preview.deployUrl}
                </p>
              )}
              {preview.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.imageUrl}
                  alt="repo owner avatar"
                  className="h-8 w-8 rounded-full border border-zinc-700"
                />
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-zinc-800 pt-4">
            <button
              onClick={onCancel}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 transition"
            >
              Cancel
            </button>
            {preview && (
              <button
                onClick={handleCreate}
                disabled={creating}
                className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 transition disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create Project'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
