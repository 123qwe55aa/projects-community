'use client';

import type { ProjectItem } from './projects-list-client';

export type { ProjectItem };

export function HoverPreview({ project }: { project: ProjectItem }) {
  const createdDate = project.createdAt
    ? new Date(
        typeof project.createdAt === 'string'
          ? project.createdAt
          : project.createdAt * 1000
      ).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="absolute z-50 w-96 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150"
      style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)' }}
    >
      <div className="mb-3 rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/60 overflow-hidden">
        {project.imageUrl && (
          <div className="relative w-full h-40 bg-zinc-950 overflow-hidden">
            <img
              src={project.imageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        <div className="px-4 py-3 border-b border-zinc-800">
          <h4 className="text-sm font-semibold text-white leading-snug line-clamp-3">
            {project.summary}
          </h4>
          {createdDate && (
            <p className="text-[11px] text-zinc-600 mt-1">Created {createdDate}</p>
          )}
        </div>

        <div className="px-4 py-3 space-y-2.5 max-h-64 overflow-y-auto">
          {project.background && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Background</p>
              <p className="text-xs text-zinc-400 leading-relaxed line-clamp-4">{project.background}</p>
            </div>
          )}

          <div className="flex gap-3 text-[11px] text-zinc-500 flex-wrap">
            <span>{project.decisionCount} decisions</span>
            <span>·</span>
            <span>{project.observationCount} observations</span>
            <span>·</span>
            <span className="capitalize">{project.growthStage}</span>
          </div>

          {project.deployUrl && (
            <a
              href={project.deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-teal-400 hover:text-teal-300 truncate"
              onClick={(e) => e.stopPropagation()}
            >
              ↗ {project.deployUrl.replace(/^https?:\/\//, '')}
            </a>
          )}

          {project.lifecycleState && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
                Lifecycle: {project.lifecycleState}
              </p>
              {project.lifecycleRationale && (
                <p className="text-xs text-zinc-500 italic leading-relaxed">
                  &ldquo;{project.lifecycleRationale}&rdquo;
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
