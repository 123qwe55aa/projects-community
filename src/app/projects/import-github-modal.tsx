'use client';

import { useState, useEffect, useRef } from 'react';
import {
  completeOneClickRepoImportAction,
  listUserReposAction,
  previewOneClickRepoImportAction,
  type GitHubProjectMatchSuggestion,
  type RepoImportPreview,
} from '@/app/actions';
import { GitHubMatchConfirmation } from './github-match-confirmation';

interface RepoItem {
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  language: string;
  topics: string[];
  avatarUrl: string;
  homepage: string;
}

const LANG_COLORS: Record<string, string> = {
  typescript: '#3178c6', javascript: '#f7df1e', python: '#3572a5',
  rust: '#dea584', go: '#00add8', java: '#b07219', ruby: '#701516',
  'c++': '#f34b7d', c: '#555555', 'c#': '#178600', swift: '#f05138',
  kotlin: '#a97bff', php: '#4f5d95', shell: '#89e051', html: '#e34c26',
  css: '#563d7c', scala: '#c22d40', dart: '#00b4ab', lua: '#000080',
  vue: '#41b883', svelte: '#ff3e00', solidity: '#aa6746',
};

function LangBadge({ lang }: { lang: string }) {
  if (!lang) return null;
  const color = LANG_COLORS[lang.toLowerCase()] ?? '#888';
  return (
    <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {lang}
    </span>
  );
}

export function ImportGithubModal({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingMatch, setPendingMatch] = useState<{
    repo: RepoImportPreview;
    suggestions: GitHubProjectMatchSuggestion[];
  } | null>(null);
  const [bindingProjectId, setBindingProjectId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await listUserReposAction();
        setRepos(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load repos');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loading && inputRef.current) inputRef.current.focus();
  }, [loading]);

  async function handleImport(fullName: string) {
    setImporting(fullName);
    setError(null);
    try {
      const preview = await previewOneClickRepoImportAction(fullName);
      if (preview.suggestions.length > 0) {
        setPendingMatch(preview);
        setImporting(null);
        return;
      }

      await completeCreateNew(preview.repo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import repo');
      setImporting(null);
    }
  }

  async function handleUseExisting(projectId: string) {
    if (!pendingMatch) return;
    setBindingProjectId(projectId);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('mode', 'bind-existing');
      formData.set('fullName', pendingMatch.repo.fullName);
      formData.set('projectId', projectId);
      await completeOneClickRepoImportAction(formData);
      setSuccess(pendingMatch.repo.fullName);
      setTimeout(() => onDone(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to bind repo');
      setBindingProjectId(null);
    }
  }

  async function handleCreateNewAnyway() {
    if (!pendingMatch) return;
    setCreatingNew(true);
    setError(null);
    try {
      await completeCreateNew(pendingMatch.repo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import repo');
      setCreatingNew(false);
    }
  }

  function handleCancelMatch() {
    setPendingMatch(null);
    setBindingProjectId(null);
    setCreatingNew(false);
    setImporting(null);
    setError(null);
  }

  async function completeCreateNew(repo: RepoImportPreview) {
    const formData = new FormData();
    formData.set('mode', 'create-new');
    formData.set('fullName', repo.fullName);
    formData.set('description', repo.description);
    formData.set('topics', JSON.stringify(repo.topics));
    formData.set('language', repo.language);
    formData.set('readmeText', repo.readmeText);
    await completeOneClickRepoImportAction(formData);
    setSuccess(repo.fullName);
    setTimeout(() => onDone(), 1200);
  }

  const filtered = repos.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.fullName.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.topics.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[80vh] w-full max-w-xl flex-col rounded-lg border border-zinc-700 bg-zinc-900">
        {/* Header */}
        <div className="shrink-0 p-6 pb-3">
          <h2 className="text-lg font-semibold text-white">Import from GitHub</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Select a repo to create a project — one click
          </p>
        </div>

        {!pendingMatch && (
          <div className="shrink-0 px-6 pb-3">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repos…"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-white focus:outline-none"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-6 mb-3 shrink-0 rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Success toast */}
        {success && (
          <div className="mx-6 mb-3 shrink-0 rounded-md border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-400">
            ✓ Imported successfully
          </div>
        )}

        {pendingMatch ? (
          <GitHubMatchConfirmation
            repo={pendingMatch.repo}
            suggestions={pendingMatch.suggestions}
            busyProjectId={bindingProjectId}
            creatingNew={creatingNew}
            onUseExisting={handleUseExisting}
            onCreateNew={handleCreateNewAnyway}
            onCancel={handleCancelMatch}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
                <span className="ml-3 text-sm text-zinc-500">Loading repos…</span>
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-600">
                {search ? 'No repos match your search' : 'No repos found'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((repo) => (
                  <button
                    key={repo.fullName}
                    onClick={() => handleImport(repo.fullName)}
                    disabled={importing !== null}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-850 px-4 py-3 text-left transition hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={repo.avatarUrl}
                        alt=""
                        className="mt-0.5 h-5 w-5 shrink-0 rounded-full"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-white">
                            {repo.fullName}
                          </span>
                          {importing === repo.fullName && (
                            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-500 border-t-white" />
                          )}
                        </div>
                        {repo.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">
                            {repo.description}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <LangBadge lang={repo.language} />
                          {repo.topics.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!pendingMatch && (
          <div className="shrink-0 border-t border-zinc-800 px-6 py-4">
            <button
              onClick={onCancel}
              disabled={importing !== null}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
