import {
  archiveProjectAction,
  correctLifecycleAction,
  mergeProjectsAction,
} from '@/app/v2-actions';
import type { LifecycleState } from '@/lib/v2/queries';
import { ProjectSubmitButton } from './ProjectSubmitButton';

type GovernanceProject = {
  id: string;
  summary: string | null;
  background: string | null;
};

export type ProjectGovernanceProps = {
  project: GovernanceProject;
  projects: GovernanceProject[];
  currentLifecycleState: LifecycleState;
};

export function ProjectGovernance({
  project,
  projects,
  currentLifecycleState,
}: ProjectGovernanceProps) {
  const mergeTargets = projects.filter(({ id }) => id !== project.id);

  return (
    <section aria-labelledby="project-governance-heading" className="space-y-4">
      <div>
        <h2 id="project-governance-heading" className="text-xl font-semibold text-white">
          Project Governance
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Correct lifecycle state, consolidate duplicate Projects, or archive this record.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GovernanceCard title="Correct lifecycle">
          <form action={correctLifecycleAction} className="space-y-3">
            <input type="hidden" name="projectId" value={project.id} />
            <FieldLabel htmlFor="lifecycle-state">Lifecycle state</FieldLabel>
            <select
              id="lifecycle-state"
              name="state"
              required
              defaultValue={currentLifecycleState}
              className={fieldClasses}
            >
              <option value="active">Active</option>
              <option value="dormant">Dormant</option>
              <option value="ended">Ended</option>
              <option value="archived">Archived</option>
            </select>
            <FieldLabel htmlFor="lifecycle-rationale">Lifecycle rationale</FieldLabel>
            <textarea
              id="lifecycle-rationale"
              name="rationale"
              required
              rows={3}
              placeholder="Why is this the correct state?"
              className={fieldClasses}
            />
            <ProjectSubmitButton label="Update Lifecycle" pendingLabel="Updating..." />
          </form>
        </GovernanceCard>

        <GovernanceCard title="Merge Project">
          {mergeTargets.length === 0 ? (
            <p className="text-sm text-zinc-400">No other Project is available as a merge target.</p>
          ) : (
            <form action={mergeProjectsAction} className="space-y-3">
              <input type="hidden" name="sourceProjectId" value={project.id} />
              <FieldLabel htmlFor="merge-target">Merge into</FieldLabel>
              <select id="merge-target" name="targetProjectId" required defaultValue="" className={fieldClasses}>
                <option value="" disabled>Select a Project</option>
                {mergeTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {projectName(target)}
                  </option>
                ))}
              </select>
              <FieldLabel htmlFor="merge-rationale">Merge rationale</FieldLabel>
              <textarea
                id="merge-rationale"
                name="rationale"
                required
                rows={3}
                placeholder="Why should these Projects be merged?"
                className={fieldClasses}
              />
              <ProjectSubmitButton label="Merge Project" pendingLabel="Merging..." />
            </form>
          )}
        </GovernanceCard>

        <GovernanceCard title="Archive Project">
          <form action={archiveProjectAction} className="space-y-3">
            <input type="hidden" name="projectId" value={project.id} />
            <FieldLabel htmlFor="archive-rationale">Archive rationale</FieldLabel>
            <textarea
              id="archive-rationale"
              name="rationale"
              required
              rows={4}
              placeholder="Why should this Project be archived?"
              className={fieldClasses}
            />
            <ProjectSubmitButton label="Archive Project" pendingLabel="Archiving..." subdued />
          </form>
        </GovernanceCard>
      </div>
    </section>
  );
}

const fieldClasses = 'w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600';

function GovernanceCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <h3 className="mb-4 text-sm font-semibold text-zinc-200">{title}</h3>
      {children}
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="block text-xs font-medium uppercase tracking-wide text-zinc-500">{children}</label>;
}

function projectName(project: GovernanceProject) {
  return project.summary ?? project.background ?? project.id;
}
