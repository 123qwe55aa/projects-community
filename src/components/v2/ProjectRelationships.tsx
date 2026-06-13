import Link from 'next/link';
import type { ProjectRelationships as ProjectRelationshipsView } from '@/lib/v2/queries';

export function ProjectRelationships({
  relationships,
}: {
  relationships: ProjectRelationshipsView;
}) {
  return (
    <section aria-labelledby="project-relationships-heading" className="space-y-4">
      <div>
        <h2 id="project-relationships-heading" className="text-xl font-semibold text-white">
          Relationships
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Projects and Signals connected through merges and shared evidence.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RelationshipGroup title="Related Projects">
          {relationships.relatedProjects.length === 0 ? (
            <EmptyState>No related Projects recorded.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {relationships.relatedProjects.map((project) => (
                <li key={project.projectId} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                  <Link
                    href={`/projects/${project.projectId}`}
                    className="font-medium text-zinc-100 transition hover:text-emerald-300"
                  >
                    {project.summary}
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {project.relationships.map((relationship) => (
                      <span key={relationship} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                        {relationship.replaceAll('_', ' ')}
                      </span>
                    ))}
                    {project.sharedEvidenceCount > 0 && (
                      <span className="text-xs text-zinc-500">
                        {project.sharedEvidenceCount} shared evidence
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </RelationshipGroup>

        <RelationshipGroup title="Related Signals">
          {relationships.relatedSignals.length === 0 ? (
            <EmptyState>No related Signals recorded.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {relationships.relatedSignals.map((signal) => (
                <li key={signal.signalId} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="font-medium text-zinc-100">{signal.title}</p>
                  <p className="mt-1 text-sm text-zinc-400">{signal.description}</p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {signal.supportingObservationCount} supporting observation
                    {signal.supportingObservationCount === 1 ? '' : 's'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </RelationshipGroup>
      </div>
    </section>
  );
}

function RelationshipGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <h3 className="mb-4 text-sm font-semibold text-zinc-200">{title}</h3>
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-400">{children}</p>;
}
