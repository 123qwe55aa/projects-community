import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase } from '@/db';
import {
  projectEvents,
  projectImportKeys,
  projects,
} from '@/db/schema';
import {
  hashProjectImport,
  type NormalizedProjectBatch,
  type NormalizedProjectImport,
} from './project-batch-contract';
import { projectProjectInTransaction } from './projection/project';

export type ProjectBatchImportResult = {
  projectsFound: number;
  projectsCreated: number;
  projectsSkipped: number;
  dryRun: boolean;
};

export async function importProjectBatch(
  batch: NormalizedProjectBatch,
  options: { dryRun?: boolean } = {},
): Promise<ProjectBatchImportResult> {
  const dryRun = options.dryRun ?? false;

  return getDatabase().db.transaction(
    (tx) => {
      let projectsCreated = 0;
      let projectsSkipped = 0;

      for (const project of batch.projects) {
        const contentHash = hashProjectImport(project);
        const existing = tx
          .select({ contentHash: projectImportKeys.contentHash })
          .from(projectImportKeys)
          .where(eq(projectImportKeys.key, project.key))
          .get();

        if (existing) {
          if (existing.contentHash !== contentHash) {
            throw new Error(`Project import conflict for key "${project.key}"`);
          }
          projectsSkipped += 1;
          continue;
        }

        projectsCreated += 1;
        if (!dryRun) createProject(tx, project, contentHash);
      }

      return {
        projectsFound: batch.projects.length,
        projectsCreated,
        projectsSkipped,
        dryRun,
      };
    },
    { behavior: 'immediate' },
  );
}

type ImportTransaction = Parameters<Parameters<ReturnType<typeof getDatabase>['db']['transaction']>[0]>[0];

function createProject(
  tx: ImportTransaction,
  project: NormalizedProjectImport,
  contentHash: string,
) {
  const projectId = nanoid();
  const createdAt = new Date();
  const rationale = `Imported from ${project.sourceRef}.`;
  const idempotencyPrefix = `batch-import:${hashKey(project.key)}`;

  tx.insert(projects)
    .values({
      id: projectId,
      summary: project.summary,
      background: project.background,
      buildingStyle: project.buildingStyle,
      growthStage: 'seed',
      visibility: 'private',
      createdAt,
      updatedAt: createdAt,
      imageUrl: project.imageUrl ?? null,
      deployUrl: project.deployUrl ?? null,
    })
    .run();
  tx.insert(projectImportKeys)
    .values({
      key: project.key,
      projectId,
      contentHash,
      sourceRef: project.sourceRef,
      createdAt,
    })
    .run();
  insertImportEvent(tx, {
    id: `${idempotencyPrefix}:01-project-created`,
    projectId,
    eventType: 'project_created',
    payload: { summary: project.summary },
    rationale,
    idempotencyKey: `${idempotencyPrefix}:project-created`,
    occurredAt: createdAt,
  });

  if (project.lifecycleState !== 'active') {
    insertImportEvent(tx, {
      id: `${idempotencyPrefix}:02-lifecycle-inferred`,
      projectId,
      eventType: 'lifecycle_inferred',
      payload: { state: project.lifecycleState, rationale },
      rationale,
      idempotencyKey: `${idempotencyPrefix}:lifecycle-inferred`,
      occurredAt: createdAt,
    });
  }

  projectProjectInTransaction(tx, projectId);
}

function insertImportEvent(
  tx: ImportTransaction,
  event: {
    id: string;
    projectId: string;
    eventType: 'project_created' | 'lifecycle_inferred';
    payload: Record<string, string>;
    rationale: string;
    idempotencyKey: string;
    occurredAt: Date;
  },
) {
  tx.insert(projectEvents)
    .values({
      ...event,
      payload: JSON.stringify(event.payload),
      actor: 'batch-import',
      createdAt: event.occurredAt,
      schemaVersion: 1,
    })
    .run();
}

function hashKey(key: string) {
  return createHash('sha256').update(key).digest('hex');
}
