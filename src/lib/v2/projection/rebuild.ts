import { asc } from 'drizzle-orm';
import { getDatabase, type DB } from '@/db';
import { projectEvents, projectionCheckpoints, projects } from '@/db/schema';
import {
  PROJECT_PROJECTION_VERSION,
  projectProjectInTransaction,
  type ProjectProjectionTransaction,
} from './project';

export const PROJECT_PROJECTION_CHECKPOINT = 'project-projections';

export async function rebuildAllProjectProjections() {
  const database = getDatabase().db;
  writeCheckpoint(database, { status: 'running', error: null });

  try {
    database.transaction(
      (tx) => {
        const boundaryEvent = tx
          .select({ id: projectEvents.id })
          .from(projectEvents)
          .orderBy(asc(projectEvents.occurredAt), asc(projectEvents.createdAt), asc(projectEvents.id))
          .all()
          .at(-1);
        const projectIds = tx
          .select({ id: projects.id })
          .from(projects)
          .orderBy(asc(projects.createdAt), asc(projects.id))
          .all();

        for (const { id } of projectIds) {
          projectProjectInTransaction(tx, id);
        }

        writeCheckpoint(tx, {
          status: 'completed',
          lastEventId: boundaryEvent?.id ?? null,
          error: null,
        });
      },
      { behavior: 'immediate' },
    );
  } catch (error) {
    writeCheckpoint(database, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function writeCheckpoint(
  store: DB | ProjectProjectionTransaction,
  input: {
    status: 'running' | 'completed' | 'failed';
    lastEventId?: string | null;
    error: string | null;
  },
) {
  store
    .insert(projectionCheckpoints)
    .values({
      name: PROJECT_PROJECTION_CHECKPOINT,
      projectionVersion: PROJECT_PROJECTION_VERSION,
      updatedAt: new Date(),
      ...input,
    })
    .onConflictDoUpdate({
      target: projectionCheckpoints.name,
      set: {
        projectionVersion: PROJECT_PROJECTION_VERSION,
        updatedAt: new Date(),
        ...input,
      },
    })
    .run();
}
