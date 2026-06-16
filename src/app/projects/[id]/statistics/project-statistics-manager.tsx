'use client';

import {
  bindProjectRepositoryAction,
  setManualProjectTypeAction,
  synchronizeProjectStatisticsAction,
} from '@/app/statistics-actions';
import { PROJECT_TYPES, type ProjectType } from '@/lib/statistics/types';

export type ProjectStatisticsManagerModel = {
  projectId: string;
  repository: {
    isBound: boolean;
    githubRepoFullName: string | null;
  };
  effectiveType: ProjectType;
  inferredType: ProjectType | null;
  manualType: ProjectType | null;
};

export function ProjectStatisticsManager({ detail }: { detail: ProjectStatisticsManagerModel }) {
  const bindButtonLabel = detail.repository.isBound ? 'Update repository' : 'Bind repository';

  async function bindRepositoryAction(formData: FormData) {
    await bindProjectRepositoryAction(formData);
  }

  async function saveTypeAction(formData: FormData) {
    await setManualProjectTypeAction(formData);
  }

  async function syncProjectAction(formData: FormData) {
    await synchronizeProjectStatisticsAction(formData);
  }

  return (
    <section
      aria-labelledby="statistics-manager-heading"
      className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
    >
      <div className="mb-5">
        <h2 id="statistics-manager-heading" className="text-lg font-semibold text-white">
          Manage Project Statistics
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Bind the GitHub repository, set an optional type override, and refresh the local snapshot.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <form action={bindRepositoryAction} className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <input type="hidden" name="projectId" value={detail.projectId} />
          <label className="block space-y-2 text-sm text-zinc-300">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              GitHub repository
            </span>
            <input
              aria-label="GitHub repository"
              name="repoFullName"
              defaultValue={detail.repository.githubRepoFullName ?? ''}
              placeholder="owner/repository"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            {bindButtonLabel}
          </button>
        </form>

        <form action={saveTypeAction} className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <input type="hidden" name="projectId" value={detail.projectId} />
          <label className="block space-y-2 text-sm text-zinc-300">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              Project type
            </span>
            <select
              aria-label="Project type"
              name="manualType"
              defaultValue={detail.manualType ?? ''}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">Automatic</option>
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {labelize(type)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            Save type
          </button>
        </form>

        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <dl className="space-y-2 text-sm">
            <TypeRow label="Effective type" value={labelize(detail.effectiveType)} />
            <TypeRow label="Inferred type" value={detail.inferredType ? labelize(detail.inferredType) : 'None'} />
            <TypeRow
              label="Manual override"
              value={detail.manualType ? labelize(detail.manualType) : 'Automatic'}
            />
          </dl>
          {detail.repository.isBound && (
            <form action={syncProjectAction}>
              <input type="hidden" name="projectId" value={detail.projectId} />
              <button
                type="submit"
                name="Sync project"
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
              >
                Sync project
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function TypeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-200">{value}</dd>
    </div>
  );
}

function labelize(value: string) {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
