'use client';

import type {
  GitHubProjectMatchSuggestion,
  RepoImportPreview,
} from '@/app/actions';

export function GitHubMatchConfirmation({
  repo,
  suggestions,
  busyProjectId,
  creatingNew,
  onUseExisting,
  onCreateNew,
  onCancel,
}: {
  repo: RepoImportPreview;
  suggestions: GitHubProjectMatchSuggestion[];
  busyProjectId: string | null;
  creatingNew: boolean;
  onUseExisting: (projectId: string) => void;
  onCreateNew: () => void;
  onCancel: () => void;
}) {
  const disabled = busyProjectId !== null || creatingNew;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-6 pb-3">
        <p className="text-sm text-zinc-400">
          <span className="font-medium text-white">{repo.fullName}</span> looks similar to an existing project.
          Choose whether to bind this repo to that project or create a separate one.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <div className="space-y-3">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.projectId}
              className="rounded-lg border border-zinc-700 bg-zinc-850 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-white">
                    {suggestion.projectSummary || suggestion.projectId}
                  </h3>
                  {suggestion.projectBackgroundExcerpt && (
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-zinc-500">
                      {suggestion.projectBackgroundExcerpt}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full border border-emerald-800 bg-emerald-950/30 px-2 py-1 text-xs font-medium text-emerald-400">
                  {Math.round(suggestion.score * 100)}% match
                </span>
              </div>

              {suggestion.matchReasons.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-zinc-400">
                  {suggestion.matchReasons.map((reason) => (
                    <li key={reason}>- {reason}</li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => onUseExisting(suggestion.projectId)}
                disabled={disabled}
                className="mt-4 inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
              >
                {busyProjectId === suggestion.projectId ? 'Binding...' : 'Use existing Project'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-800 px-6 py-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCreateNew}
            disabled={disabled}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 disabled:opacity-50"
          >
            {creatingNew ? 'Creating...' : 'Create new Project'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="rounded-md border border-zinc-800 px-4 py-2 text-sm text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
