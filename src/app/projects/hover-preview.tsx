'use client';

import type { ProjectItem } from './projects-list-client';

export type { ProjectItem };

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function fmtDate(ts: string | number | null | undefined): string | null {
  if (!ts) return null;
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts * 1000);
  if (isNaN(d.getTime())) return null;
  return DATE_FORMAT.format(d);
}

function previewLines(text: string | null | undefined): string[] | null {
  if (!text || text === '[]' || text === '{}') return null;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    if (typeof parsed === 'string') return [parsed];
    return null;
  } catch {
    return [text];
  }
}

export function HoverPreview({ project }: { project: ProjectItem }) {
  const obs = previewLines(project.obstacles);
  const changes = previewLines(project.recentChanges);
  const themes = previewLines(project.activeThemes);

  return (
    <div
      className="
        pointer-events-none absolute z-50 w-96
        -translate-y-full -translate-x-1/2 left-1/2
        pb-3
        opacity-0 group-hover:opacity-100
        transition-opacity duration-200
      "
    >
      <div className="rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/60 overflow-hidden">
        {/* Image */}
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

        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-800">
          <h4 className="text-sm font-semibold text-white leading-snug line-clamp-3">
            {project.summary}
          </h4>
          {project.createdAt && (
            <p className="text-[11px] text-zinc-600 mt-1">
              Created {fmtDate(project.createdAt)}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-2.5 max-h-64 overflow-y-auto">
          {/* Background */}
          {project.background && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
                Background
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed line-clamp-4">
                {project.background}
              </p>
            </div>
          )}

          {/* Stats row */}
          <div className="flex gap-3 text-[11px] text-zinc-500">
            <span>{project.decisionCount} decisions</span>
            <span>·</span>
            <span>{project.observationCount} observations</span>
            <span>·</span>
            <span className="capitalize">{project.growthStage}</span>
          </div>

          {/* Deploy link */}
          {project.deployUrl && (
            <a
              href={project.deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-teal-400 hover:text-teal-300 transition truncate"
              onClick={(e) => e.stopPropagation()}
            >
              ↗ {project.deployUrl.replace(/^https?:\/\//, '')}
            </a>
          )}

          {/* Lifecycle */}
          {project.lifecycleState && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
                Lifecycle: {project.lifecycleState}
              </p>
              {project.lifecycleRationale && (
                <p className="text-xs text-zinc-500 italic leading-relaxed">
                  "{project.lifecycleRationale}"
                </p>
              )}
            </div>
          )}

          {/* Obstacles */}
          {obs && obs.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
                Obstacles
              </p>
              <ul className="space-y-0.5">
                {obs.slice(0, 3).map((o, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex gap-1.5">
                    <span className="text-zinc-700 shrink-0">•</span>
                    <span className="line-clamp-2">{o}</span>
                  </li>
                ))}
                {obs.length > 3 && (
                  <li className="text-[11px] text-zinc-600">
                    +{obs.length - 3} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Recent Changes */}
          {changes && changes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
                Recent Changes
              </p>
              <ul className="space-y-0.5">
                {changes.slice(0, 2).map((c, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex gap-1.5">
                    <span className="text-zinc-700 shrink-0">•</span>
                    <span className="line-clamp-2">{c}</span>
                  </li>
                ))}
                {changes.length > 2 && (
                  <li className="text-[11px] text-zinc-600">
                    +{changes.length - 2} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Active Themes */}
          {themes && themes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
                Active Themes
              </p>
              <div className="flex flex-wrap gap-1">
                {themes.slice(0, 4).map((t, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400"
                  >
                    {t}
                  </span>
                ))}
                {themes.length > 4 && (
                  <span className="text-[11px] text-zinc-600">
                    +{themes.length - 4}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
