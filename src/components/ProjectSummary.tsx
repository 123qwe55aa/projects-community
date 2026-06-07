import type { InferSelectModel } from 'drizzle-orm';
import type { projects } from '@/db/schema';

type Project = InferSelectModel<typeof projects>;

interface ProjectSummaryProps {
  project: Project;
}

export function ProjectSummary({ project }: ProjectSummaryProps) {
  const hasContent = project.background || project.summary;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
      <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
        Summary
      </h2>

      {!hasContent ? (
        <p className="text-sm text-zinc-500 italic">
          Research in progress — summary will be generated as conversations develop.
        </p>
      ) : (
        <div className="space-y-3">
          {project.summary && project.summary !== project.background && (
            <p className="text-sm text-zinc-200 leading-relaxed">{project.summary}</p>
          )}
          {project.background && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Background</p>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {project.background}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
